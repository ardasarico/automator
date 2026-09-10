import {
  aiErrorDetail,
  aiFlowTestSchema,
  findFlowDocumentProblem,
  findFlowConfigProblems,
  flowDocumentInputSchema,
  flowNodeConfigSchemas,
  flowNodePorts,
  flowNodeTypes,
  layoutFlowPositions,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  Type,
  type AiHistoryTurn,
  type FlowDocumentInput,
  type FlowEdge,
  type FlowNode,
  type AiVerification,
  type FlowNodeType,
  type GenerateFlowResponse,
  type TObject,
} from "@automator/contracts";
import {
  defaultExecutors,
  LanguageModelError,
  parseJsonAnswer,
  type ChatMessage,
  type LanguageModel,
} from "@automator/flow-engine";

import { requestBudgetMs, withRequestDeadline } from "./client";
import {
  FlowTestError,
  maxTestScenarios,
  verificationBudgetMs,
  VerificationTimeoutError,
  verifyFlow,
} from "./verify-flow";

/** One draft and, if it does not check out, one repair. */
export const modelAttempts = 2;

export const generatableNodeTypes = flowNodeTypes.filter(
  (type) => type === "logic.for-each" || defaultExecutors[type] !== undefined,
);

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

export class FlowGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowGenerationError";
  }
}

interface DraftNode {
  id: string;
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
}
interface DraftEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
interface Draft {
  name: string;
  description: string;
  summary: string;
  nodes: DraftNode[];
  edges: DraftEdge[];
}

/** The account's tables as the prompt and the validation see them. `DataTable` fits this shape. */
export interface AiDataTable {
  id: string;
  name: string;
  columns: readonly { id: string; name: string; type: string }[];
}

/** The table section of the prompt: the only table ids a `data.*` node may carry. */
function describeDataTables(tables: readonly AiDataTable[]): string {
  if (tables.length === 0)
    return "This account has no data tables, so you must not use any data.* node.";
  const lines = tables
    .map(
      (table) =>
        `- id "${table.id}" named "${table.name}": columns ${
          table.columns.map((column) => `${column.id} (${column.type})`).join(", ") || "none"
        }`,
    )
    .join("\n");
  return `A data.* node's tableId must be one of these table ids exactly, and its column references must be column ids of that table. Never invent a table id, a column id or a table name:\n${lines}`;
}

/*
 * One line per node type: handles first, then the config schema.
 *
 * Measured, do not "improve" this without measuring again. Wrong-handle failures are the most
 * common way a generated flow is rejected, and they are never invented names — always a real
 * token from an adjacent namespace: the node's own output (an edge into trigger.balance's
 * "balance"), or one of its config keys (an edge into notify.email's "text"). The obvious fix,
 * listing the config keys beside the handles as forbidden, was tried on 2026-09-10 and made
 * things worse: enumerating the wrong answers put them in front of the model in the same breath
 * as forbidding them, and the failures moved onto the newly listed tokens. gpt-4.1-mini went
 * 5/5 -> 2/5 on a webhook prompt. (The salience story is unproven: the baseline prompt reaches
 * for config keys too, so listing them did not create that substitution.) Length is not free
 * either — that variant was 11% longer, and gpt-oss-120b, already answering in 33-104s against a
 * 130s ceiling, went from one timeout in five to three. Separating any of this from prominence
 * needs a real evaluation, not another guess.
 *
 * The same shape shows up a second time, so restating rules is not the lever: the prompt already
 * says "each input handle takes at most one edge", and the commonest failure on any branching
 * request is still two edges into one input. logic.merge exists for exactly that fan-in and the
 * model reaches past it. Whether merge is discoverable enough — here and on the canvas, for human
 * authors too — is a product question, not a prompt one.
 */
function describeNodeTypes(): string {
  return generatableNodeTypes
    .map((type) => {
      const { inputs, outputs } = flowNodePorts[type];
      const schema = configSchemas[type];
      return `- ${type}: inputs [${inputs.join(", ")}], outputs [${outputs.join(", ")}], config ${JSON.stringify(schema ?? {})}`;
    })
    .join("\n");
}

export const systemPrompt = (
  tables?: readonly AiDataTable[],
) => `You design automation flows for Automator, a visual canvas for onchain workflows.
A flow is a directed acyclic graph. It starts at a trigger node (a type whose inputs list is empty); every other node must have at least one incoming edge. Edges connect a source node's output handle to a target node's input handle, and each input handle takes at most one edge. Screens are pages the visitor sees in a mini-app; a run pauses there until the visitor acts.
logic.for-each repeats the steps after its Item output for each element of its items list (a JSON string or a template resolving to a list, maxItems at most 100). Its Done output carries {items, results, count} after all iterations. Put screens after Done, never inside the Item body. Do not draw a cycle to express a loop.
Config strings may reference upstream values with templates: {{input.<input handle>}} is the value delivered to that handle, {{vars.<name>}} a variable set earlier, {{trigger.<path>}} the trigger payload. The handle in {{input.<input handle>}} is always the receiving node's OWN input handle, never the upstream node's output handle: a notify.discord node reads what arrived on its "message" input as {{input.message}} (not {{input.result}} or {{input.text}}), a logic.condition reads {{input.value}}. A trigger hands its whole payload (an object, e.g. a webhook body) to its output handle, so a field of it is addressed as {{input.<input handle>.<field>}} on the next node, or {{trigger.<field>}} anywhere.

Execution rules and examples:
- screen.form fields are objects with id, label, type, required and sample. Set a unique nonempty id such as "ticketCount", type "number", required true, sample "2". Submitted form values are strings keyed by field id.
- A form wired to a condition's value input is read with {{input.value.ticketCount}}. Conditions forward the original value unchanged on true/false. A page wired to their output displays {{input.data.ticketCount}} in its body.
- A form wired to a run-code node's input is read inside JavaScript as input.ticketCount (the function receives the value of that single handle, not all handles). Example: return {totalCost: Number(input.ticketCount) * 25};. A page after it displays Total: {{input.data.totalCost}}.
- run-code requires the server sandbox and cannot run in browser preview. External service, identity and onchain nodes are not exercised by automatic checks. Do not describe those checks as proof of real delivery/payment.
- graph.query-subgraph sends a GraphQL query to a subgraph on The Graph Network and outputs the response's data object on its data handle, so the next node reads a field as {{input.<its input handle>.<entity>.<field>}}. Put variable values in the variables JSON, not in the query text. ai.agent may be given the query_subgraph tool, which reads only the subgraph named in its config.
- Prefer native conditions and data nodes when they suffice. Supply representative samplePayload JSON on triggers, using the actual payload shape. Missing field ids, wrong port references and failing behavior tests are rejected.

Node types you may use, with their handles and full config schemas:
${describeNodeTypes()}

The data tables of the account making this request:
${describeDataTables(tables ?? [])}

Earlier turns of the conversation may come before the request; assistant turns there are the summaries the user saw, and the flow JSON in the request is always the current state of the canvas.

Answer with one JSON object and nothing else. To propose a flow:
{"name": string, "description": string, "summary": string, "nodes": [{"id": string, "type": string, "label": string, "config": object}], "edges": [{"source": string, "sourceHandle": string, "target": string, "targetHandle": string}]}
Include a "tests" array in flow answers. A mini-app with a form MUST include at least one test (at least two when it branches), with concrete answers and expected result screens or output values derived from the user's request. Include boundary cases such as 0, 4 and 5 for a 1-to-4 limit. These are test-only inputs, never changes to the saved form sample. Each test follows this schema:
${JSON.stringify(aiFlowTestSchema)}
Example: {"name":"Two tickets cost 50","answers":{"form":{"port":"submitted","data":{"ticketCount":"2"}}},"expect":[{"nodeId":"calculate","output":"output","path":"totalCost","equals":50},{"nodeId":"result","screenBody":"Total: 50"}]}.
A nodeId-only expectation asserts that the node was reached. Add output (and path) to assert that value was produced, narrowed by equals, greaterThan, lessThan or contains; screenBody checks rendered text. Use actual node ids from the proposal. For non-mini-app triggers also provide triggerNodeId and payload.
Use short unique ids such as "n1", "n2". Labels are short and human. Only set config fields listed above; leave secrets such as webhook URLs empty for the user to fill in. "summary" is one or two sentences for the user about what the flow does or what you changed.
When the request is a question, asks for an explanation, or needs one clarification before you can build anything, answer {"message": string} instead, in plain prose; never propose a flow for a message that does not ask to build or change one. The user decides what lands on the canvas.`;

export function withoutPositions(document: FlowDocumentInput) {
  return {
    name: document.name,
    description: document.description,
    nodes: document.nodes.map(({ id, type, label, config }) => ({ id, type, label, config })),
    edges: document.edges.map(({ source, sourceHandle, target, targetHandle }) => ({
      source,
      sourceHandle,
      target,
      targetHandle,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDraft(answer: unknown): Draft {
  if (!isRecord(answer)) throw new FlowGenerationError("The answer is not a JSON object");
  if (!Array.isArray(answer.nodes) || !Array.isArray(answer.edges))
    throw new FlowGenerationError("The answer needs nodes and edges arrays");
  if (answer.nodes.length > 80)
    throw new FlowGenerationError("AI proposals are limited to 80 nodes.");
  const nodes: DraftNode[] = answer.nodes.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.type !== "string")
      throw new FlowGenerationError(`Node ${index + 1} needs an id and a type`);
    if (!(generatableNodeTypes as readonly string[]).includes(raw.type))
      throw new FlowGenerationError(`Node type "${raw.type}" is not available`);
    return {
      id: raw.id,
      type: raw.type as FlowNodeType,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : raw.type,
      config: isRecord(raw.config) ? raw.config : {},
    };
  });
  const edges: DraftEdge[] = answer.edges.map((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.source !== "string" ||
      typeof raw.target !== "string" ||
      typeof raw.sourceHandle !== "string" ||
      typeof raw.targetHandle !== "string"
    )
      throw new FlowGenerationError(
        `Edge ${index + 1} needs source, sourceHandle, target and targetHandle`,
      );
    return {
      source: raw.source,
      sourceHandle: raw.sourceHandle,
      target: raw.target,
      targetHandle: raw.targetHandle,
    };
  });
  return {
    name:
      typeof answer.name === "string" && answer.name.trim()
        ? answer.name.trim().slice(0, 120)
        : "Untitled flow",
    description: typeof answer.description === "string" ? answer.description.slice(0, 1000) : "",
    summary:
      typeof answer.summary === "string"
        ? answer.summary
        : typeof answer.message === "string"
          ? answer.message
          : "",
    nodes,
    edges,
  };
}

function readMessage(answer: unknown): string | undefined {
  if (!isRecord(answer) || "nodes" in answer || "edges" in answer) return undefined;
  return typeof answer.message === "string" && answer.message.trim()
    ? answer.message.trim()
    : undefined;
}

function hasCycle(nodes: DraftNode[], edges: DraftEdge[]): boolean {
  const pending = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    pending.set(edge.target, pending.get(edge.target)! + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const ready = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
  let seen = 0;
  while (ready.length > 0) {
    const id = ready.pop()!;
    seen += 1;
    for (const target of outgoing.get(id)!) {
      const left = pending.get(target)! - 1;
      pending.set(target, left);
      if (left === 0) ready.push(target);
    }
  }
  return seen < nodes.length;
}

/** `tables` is the owner's table list; a data node naming anything else is rejected as invalid wiring. */
export function materialize(draft: Draft, tables: readonly AiDataTable[] = []): FlowDocumentInput {
  if (draft.nodes.length === 0) throw new FlowGenerationError("The flow has no nodes");
  const nodesById = new Map<string, DraftNode>();
  for (const node of draft.nodes) {
    if (nodesById.has(node.id)) throw new FlowGenerationError(`Duplicate node id "${node.id}"`);
    nodesById.set(node.id, node);
  }
  const incoming = new Set<string>();
  const targets = new Set<string>();
  for (const edge of draft.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source) throw new FlowGenerationError(`Edge starts at unknown node "${edge.source}"`);
    if (!target) throw new FlowGenerationError(`Edge ends at unknown node "${edge.target}"`);
    if (!flowNodePorts[source.type].outputs.includes(edge.sourceHandle))
      throw new FlowGenerationError(`"${source.type}" has no output handle "${edge.sourceHandle}"`);
    if (!flowNodePorts[target.type].inputs.includes(edge.targetHandle))
      throw new FlowGenerationError(`"${target.type}" has no input handle "${edge.targetHandle}"`);
    const slot = `${edge.target}:${edge.targetHandle}`;
    if (incoming.has(slot))
      throw new FlowGenerationError(
        `Input "${edge.targetHandle}" of "${edge.target}" has two edges`,
      );
    incoming.add(slot);
    targets.add(edge.target);
  }
  if (!draft.nodes.some((node) => flowNodePorts[node.type].inputs.length === 0))
    throw new FlowGenerationError("The flow needs a trigger node");
  for (const node of draft.nodes) {
    const isTrigger = flowNodePorts[node.type].inputs.length === 0;
    if (!isTrigger && !targets.has(node.id))
      throw new FlowGenerationError(`Node "${node.id}" has no incoming edge`);
  }
  if (hasCycle(draft.nodes, draft.edges))
    throw new FlowGenerationError("The flow contains a cycle");

  const positions = layoutFlowPositions(draft.nodes, draft.edges);
  const nodes: FlowNode[] = draft.nodes.map((node) => {
    const schema = configSchemas[node.type];
    let config = node.config;
    if (schema) {
      try {
        config = parseNodeConfig(schema, node.config) as Record<string, unknown>;
      } catch {
        throw new FlowGenerationError(`Config of "${node.id}" does not fit "${node.type}"`);
      }
    }
    return {
      id: node.id,
      type: node.type,
      position: positions.get(node.id)!,
      label: node.label,
      config,
    };
  });
  const edges: FlowEdge[] = draft.edges.map((edge, index) => ({ id: `e${index + 1}`, ...edge }));
  const document: FlowDocumentInput = {
    version: 1,
    name: draft.name,
    description: draft.description,
    nodes,
    edges,
  };
  if (!Value.Check(flowDocumentInputSchema, document))
    throw new FlowGenerationError("The flow does not fit the document schema");
  const problem = findFlowDocumentProblem(document);
  if (problem) throw new FlowGenerationError(problem);
  const configProblems = findFlowConfigProblems(document, tables);
  for (const node of document.nodes) {
    if (
      node.type === "screen.form" &&
      (!Array.isArray(node.config.fields) || node.config.fields.length === 0)
    )
      configProblems.push({
        nodeId: node.id,
        path: "config.fields",
        message: "A generated form needs at least one field.",
      });
    if (node.type === "logic.set-variable" && !String(node.config.name ?? "").trim())
      configProblems.push({
        nodeId: node.id,
        path: "config.name",
        message: "Set variable needs a name.",
      });
  }
  if (configProblems.length)
    throw new FlowGenerationError(
      configProblems
        .slice(0, 8)
        .map((p) => `${p.nodeId}.${p.path}: ${p.message}`)
        .join("\n"),
    );
  return document;
}

const modelHistoryLimit = 12;
const modelHistoryTurnLength = 1500;

export function historyMessages(history: readonly AiHistoryTurn[] = []): ChatMessage[] {
  return history
    .slice(-modelHistoryLimit)
    .filter((turn) => turn.text.trim() !== "")
    .map((turn) => ({ role: turn.role, content: turn.text.slice(0, modelHistoryTurnLength) }));
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
): Promise<AiVerification> {
  /* Whichever comes first: the checks' own ceiling, or what is left of the whole request. */
  const deadline = Math.min(Date.now() + budgetMs, deadlineAt);
  try {
    return await verifyFlow(document, tests, deadline, tables);
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
      const fallback = await verifyFlow(document, undefined, deadline, tables);
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

export async function askForFlow(
  model: LanguageModel,
  messages: ChatMessage[],
  tables: readonly AiDataTable[] = [],
  /** What the automatic checks may spend per attempt; the default is the shipped ceiling. */
  budgetMs: number = verificationBudgetMs,
  /** The instant the whole request must be done by, shared by every attempt and fallback hop. */
  deadlineAt: number = Date.now() + requestBudgetMs,
): Promise<GenerateFlowResponse> {
  const ask = withRequestDeadline(model, deadlineAt);
  let lastProblem: string | undefined;
  let pinnedTests: unknown;
  /* The most recent answer that produced a real flow document, checks aside. */
  let drafted: { document: FlowDocumentInput; summary: string } | undefined;
  for (let attempt = 0; attempt < modelAttempts; attempt += 1) {
    const answer = await ask({
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0.2,
    });
    try {
      const parsed = parseJsonAnswer(answer.content);
      const message = readMessage(parsed);
      if (message !== undefined) return { kind: "message", text: message };
      const tests = pinnedTests ?? (isRecord(parsed) ? parsed.tests : undefined);
      if (
        Array.isArray(tests) &&
        tests.length &&
        Value.Check(Type.Array(aiFlowTestSchema, { maxItems: maxTestScenarios }), tests)
      )
        pinnedTests = structuredClone(tests);
      const draft = readDraft(parsed);
      const document = materialize(draft, tables);
      // Past this line there is a flow worth handing over, whatever its checks go on to say.
      drafted = { document, summary: draft.summary };
      if (
        document.nodes.some((n) => n.type === "trigger.miniapp-open") &&
        document.nodes.some((n) => n.type === "screen.form")
      ) {
        const minimum = document.nodes.some((n) => n.type === "logic.condition") ? 2 : 1;
        if (!Array.isArray(tests) || tests.length < minimum)
          throw new FlowGenerationError(
            `This mini-app needs at least ${minimum} behavioral test scenarios with form answers and expected results.`,
          );
      }
      const verification = await checkFlow(document, tests, budgetMs, deadlineAt, tables);
      return { kind: "flow", document, summary: draft.summary, verification };
    } catch (error) {
      if (!(error instanceof FlowGenerationError) && !(error instanceof LanguageModelError))
        throw error;
      /* Out of time is not something a repair prompt can fix, and it is not an invalid flow. */
      if (error instanceof LanguageModelError && error.kind === "timeout") throw error;
      lastProblem = error.message;
      messages.push({ role: "assistant", content: answer.content ?? "" });
      messages.push({
        role: "user",
        content: `That answer is not a valid flow: ${lastProblem}. Correct the flow to satisfy the original request, preserving node ids and the original test expectations; do not weaken an expectation to match broken behavior. Answer with the corrected JSON object only.`,
      });
    }
  }
  /*
   * The repair failed, but a flow that does not pass its checks is not the same as no flow. The
   * user is looking at a canvas: a wiring fault they can see and fix beats being told to rephrase
   * and losing the draft with it. Only a genuinely empty hand — an unreadable answer, a graph
   * `materialize` rejects, a model that never replied — is still fatal.
   */
  if (drafted !== undefined)
    return {
      kind: "flow",
      ...drafted,
      verification: {
        checks: [
          {
            name: "Automatic checks",
            status: "failed",
            detail: aiErrorDetail(lastProblem ?? "") ?? "The checks did not pass.",
          },
        ],
        warnings: [
          "This draft did not pass its automatic checks. Read the failure above, fix it on the canvas, and do not turn the flow on until it passes.",
        ],
      },
    };
  throw new FlowGenerationError(lastProblem ?? "The model did not produce a valid flow");
}

export async function generateFlow(
  model: LanguageModel,
  prompt: string,
  current?: FlowDocumentInput,
  history?: readonly AiHistoryTurn[],
  tables: readonly AiDataTable[] = [],
  budgetMs: number = verificationBudgetMs,
  deadlineAt: number = Date.now() + requestBudgetMs,
): Promise<GenerateFlowResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(tables) },
    ...historyMessages(history),
  ];
  if (current) {
    messages.push({
      role: "user",
      content: `Here is the current flow as JSON:\n${JSON.stringify(withoutPositions(current))}\n\nChange it as follows, keeping everything else (ids included) unless the change requires otherwise: ${prompt}`,
    });
  } else {
    messages.push({ role: "user", content: `Design a flow for this request: ${prompt}` });
  }
  return askForFlow(model, messages, tables, budgetMs, deadlineAt);
}
