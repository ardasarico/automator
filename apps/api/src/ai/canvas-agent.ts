import {
  aiErrorDetail,
  aiFlowTestSchema,
  Value,
  type AiContext,
  type AiMessage,
  type AiPart,
  type AiStreamEvent,
  type AiVerification,
  type FlowDocumentInput,
} from "@automator/contracts";
import { LanguageModelError, type ChatMessage, type LanguageModel } from "@automator/flow-engine";
import { requestBudgetMs, withRequestDeadline } from "./client";
import { FlowGenerationError, materialize, type AiDataTable } from "./draft";
import { systemPrompt, userTurn } from "./prompt";
import { canvasTools } from "./tools";
import {
  FlowTestError,
  maxTestScenarios,
  verificationBudgetMs,
  VerificationTimeoutError,
  verifyFlow,
} from "./verify-flow";
import { ToolCallError, WorkingCopy } from "./working-copy";

export const maxToolCalls = 40;
const historyMessages = 12;
const historyTextLength = 1500;
const mutatingTools = [
  "add_node",
  "update_node",
  "remove_node",
  "connect",
  "disconnect",
  "set_flow",
];

export interface CanvasAgentInput {
  model: LanguageModel;
  text: string;
  current?: FlowDocumentInput;
  context?: AiContext;
  history: readonly AiMessage[];
  tables?: readonly AiDataTable[];
  emit(event: AiStreamEvent): void;
  signal?: AbortSignal;
  deadlineAt?: number;
  verificationBudget?: number;
  /** The automatic checks, swappable so a test can drive their failure modes. */
  verify?: typeof verifyFlow;
}

/** Earlier turns as the model saw them: text, tool calls and their results; never a proposal. */
export function historyToMessages(history: readonly AiMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const message of history.slice(-historyMessages)) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .slice(0, historyTextLength);
    const tools = message.parts.filter((part) => part.type === "tool");
    // A turn the model never wrote — a bare proposal, or a message cleared of its text — has
    // nothing to replay, and an empty assistant content is a shape some providers refuse.
    if (!text && tools.length === 0) continue;
    if (message.role === "user") {
      messages.push({ role: "user", content: text });
      continue;
    }
    messages.push({
      role: "assistant",
      content: text,
      ...(tools.length
        ? {
            toolCalls: tools.map((tool) => ({
              id: tool.id,
              name: tool.name,
              arguments: tool.args,
            })),
          }
        : {}),
    });
    for (const tool of tools)
      messages.push({ role: "tool", toolCallId: tool.id, content: tool.detail ?? "" });
  }
  return messages;
}

/**
 * Runs the automatic checks, keeping the two failures apart: a flow that misbehaves is fatal and
 * worth a repair attempt, while scenarios the model wrote badly are its own bookkeeping. Those
 * degrade to a warning on a flow that is otherwise delivered, because throwing away a good draft
 * over an unusable test scenario is the worse answer.
 */
async function checkFlow(
  document: FlowDocumentInput,
  tests: unknown,
  budgetMs: number,
  deadlineAt: number,
  tables: readonly AiDataTable[],
  verify: typeof verifyFlow,
): Promise<AiVerification> {
  /* Whichever comes first: the checks' own ceiling, or what is left of the whole request. */
  const deadline = Math.min(Date.now() + budgetMs, deadlineAt);
  try {
    return await verify(document, tests, deadline, tables);
  } catch (error) {
    if (!(error instanceof FlowTestError))
      throw new FlowGenerationError(
        error instanceof Error ? error.message : "Automatic checks failed",
      );
    const unusable =
      error instanceof VerificationTimeoutError
        ? `The automatic checks did not finish in time: ${error.message}`
        : `The model's own test scenarios could not be used: ${error.message}`;
    // No budget left for a second pass, and none of this is worth losing the flow over.
    if (Date.now() >= deadline) return { checks: [], warnings: [unusable] };
    try {
      // The scenarios are gone, so this is a sample run of the flow: still a real check.
      const fallback = await verify(document, undefined, deadline, tables);
      return { ...fallback, warnings: [...fallback.warnings, unusable] };
    } catch (fallbackError) {
      if (!(fallbackError instanceof FlowTestError))
        throw new FlowGenerationError(
          fallbackError instanceof Error ? fallbackError.message : "Automatic checks failed",
        );
      return { checks: [], warnings: [unusable] };
    }
  }
}

export async function runCanvasAgent(input: CanvasAgentInput): Promise<AiPart[]> {
  const deadlineAt = input.deadlineAt ?? Date.now() + requestBudgetMs;
  const ask = withRequestDeadline(input.model, deadlineAt);
  const tables = input.tables ?? [];
  const verify = input.verify ?? verifyFlow;
  const copy = new WorkingCopy(input.current);
  const parts: AiPart[] = [];
  const tests: unknown[] = [];
  let text = "";
  let calls = 0;
  let asked = false;
  let suggested = false;
  let repaired = false;

  const emit = input.emit;
  const pushText = (content: string | null) => {
    if (!content) return;
    text += (text ? "\n\n" : "") + content;
    emit({ type: "text.delta", delta: content });
  };
  const flushText = () => {
    if (text) parts.push({ type: "text", text });
    text = "";
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(tables) },
    ...historyToMessages(input.history),
    { role: "user", content: userTurn(input.text, input.current, input.context) },
  ];

  const execute = (name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case "add_node":
        return copy.addNode(args);
      case "update_node":
        return copy.updateNode(args);
      case "remove_node":
        return copy.removeNode(args);
      case "connect":
        return copy.connect(args);
      case "disconnect":
        return copy.disconnect(args);
      case "set_flow":
        return copy.setFlow(args);
      case "add_test": {
        if (!Value.Check(aiFlowTestSchema, args))
          throw new ToolCallError(
            "The test does not match the scenario shape: name, optional triggerNodeId/payload/answers, and expect[]",
          );
        if (tests.length >= maxTestScenarios)
          throw new ToolCallError(`At most ${maxTestScenarios} test scenarios`);
        tests.push(args);
        return `Added test "${args.name}"`;
      }
      case "ask_user": {
        const options = Array.isArray(args.options)
          ? args.options.filter((option) => typeof option === "string").slice(0, 4)
          : [];
        if (typeof args.question !== "string" || !args.question.trim())
          throw new ToolCallError("ask_user needs a question");
        asked = true;
        flushText();
        parts.push({ type: "question", text: args.question.trim(), options });
        return "Asked. Wait for the user's answer.";
      }
      case "suggest_next": {
        const items = Array.isArray(args.items)
          ? args.items.filter((item) => typeof item === "string").slice(0, 3)
          : [];
        if (items.length === 0) throw new ToolCallError("suggest_next needs at least one item");
        if (parts.some((part) => part.type === "suggestions"))
          throw new ToolCallError("suggest_next was already called this turn");
        // Kept apart from the running text so it renders as chips after everything else.
        parts.push({ type: "suggestions", items });
        return "Noted.";
      }
      default:
        throw new ToolCallError(`Unknown tool "${name}"`);
    }
  };

  const loop = async (): Promise<void> => {
    for (;;) {
      input.signal?.throwIfAborted();
      const answer = await ask({ messages, tools: canvasTools, temperature: 0.2 });
      pushText(answer.content);
      if (answer.toolCalls.length === 0) return;
      messages.push({
        role: "assistant",
        content: answer.content ?? "",
        toolCalls: answer.toolCalls,
      });
      for (const call of answer.toolCalls) {
        if (calls >= maxToolCalls)
          throw new FlowGenerationError(
            `The agent stopped after ${maxToolCalls} tool calls without finishing`,
          );
        calls += 1;
        emit({ type: "tool.call", id: call.id, name: call.name, args: call.arguments });
        let ok = true;
        let detail: string;
        let failure: unknown;
        try {
          detail = execute(call.name, call.arguments);
        } catch (error) {
          ok = false;
          if (error instanceof ToolCallError) detail = error.message;
          else {
            // Not a refusal the tools model. It ends the turn, but only once this call is
            // closed: a tool.call the panel never sees answered would spin forever.
            failure = error;
            detail = "The tool failed unexpectedly";
          }
        }
        const mutated = ok && mutatingTools.includes(call.name);
        emit({
          type: "tool.result",
          id: call.id,
          ok,
          detail,
          ...(mutated ? { document: copy.toPreview() } : {}),
        });
        if (call.name !== "ask_user" && call.name !== "suggest_next")
          parts.push({
            type: "tool",
            id: call.id,
            name: call.name,
            args: call.arguments,
            ok,
            detail,
          });
        if (failure !== undefined) throw failure;
        messages.push({ role: "tool", toolCallId: call.id, content: detail });
        if (asked) return;
      }
      if (!suggested) {
        const suggestions = parts.find((part) => part.type === "suggestions");
        if (suggestions) {
          suggested = true;
          emit({ type: "suggestions", items: suggestions.items });
        }
      }
    }
  };

  /** A question ends the turn wherever it was asked, with nothing offered to the canvas. */
  const finishWithQuestion = (): AiPart[] => {
    const question = parts.find((part) => part.type === "question")!;
    emit({ type: "question", text: question.text, options: question.options });
    flushText();
    return orderParts(parts);
  };

  try {
    await loop();
    if (asked) return finishWithQuestion();
    if (!copy.changed) {
      flushText();
      return orderParts(parts);
    }
    emit({ type: "status", phase: "checking" });
    let document: FlowDocumentInput | undefined;
    let problem: string | undefined;
    try {
      document = materialize(copy.toDraft(), tables);
    } catch (error) {
      if (!(error instanceof FlowGenerationError)) throw error;
      problem = error.message;
    }
    if (problem !== undefined && !repaired) {
      repaired = true;
      emit({ type: "status", phase: "repairing", detail: problem });
      messages.push({
        role: "user",
        content: `That is not a valid flow yet: ${problem}. Fix it with the tools, keeping ids, then stop.`,
      });
      await loop();
      if (asked) return finishWithQuestion();
      emit({ type: "status", phase: "checking" });
      try {
        document = materialize(copy.toDraft(), tables);
        problem = undefined;
      } catch (error) {
        if (!(error instanceof FlowGenerationError)) throw error;
        problem = error.message;
      }
    }
    flushText();
    const replaces = input.current === undefined;
    if (document === undefined) {
      /* A visible fault on the canvas beats a lost draft: offer the preview with a failed check. */
      const draft = copy.toPreview();
      const verification: AiVerification = {
        checks: [
          {
            name: "Automatic checks",
            status: "failed",
            detail: aiErrorDetail(problem ?? "") ?? "The checks did not pass.",
          },
        ],
        warnings: [
          "This draft did not pass its automatic checks. Fix it on the canvas and do not turn the flow on until it passes.",
        ],
      };
      emit({ type: "proposal", document: draft, verification, replaces });
      parts.push({ type: "proposal", document: draft, verification, replaces, state: "pending" });
      return orderParts(parts);
    }
    const verification = await checkFlow(
      document,
      tests.length ? tests : undefined,
      input.verificationBudget ?? verificationBudgetMs,
      deadlineAt,
      tables,
      verify,
    );
    emit({ type: "proposal", document, verification, replaces });
    parts.push({ type: "proposal", document, verification, replaces, state: "pending" });
    return orderParts(parts);
  } catch (error) {
    if (error instanceof LanguageModelError) throw error;
    flushText();
    const detail = aiErrorDetail(error instanceof Error ? error.message : String(error));
    const code =
      error instanceof FlowGenerationError ? ("invalid_flow" as const) : ("unavailable" as const);
    emit({ type: "error", error: code, ...(detail ? { detail } : {}) });
    parts.push({ type: "error", error: code, ...(detail ? { detail } : {}) });
    return orderParts(parts);
  }
}

/**
 * The render order of one assistant message: the tool calls as they happened, then the prose the
 * model wrote about them, then a question or the follow-up chips, then the proposal card the user
 * acts on, and an error last. `Array.prototype.sort` is stable in Bun, so tools keep their order.
 */
function orderParts(parts: AiPart[]): AiPart[] {
  const rank: Record<AiPart["type"], number> = {
    tool: 0,
    text: 1,
    question: 2,
    suggestions: 3,
    proposal: 4,
    error: 5,
  };
  return [...parts].sort((a, b) => rank[a.type] - rank[b.type]);
}
