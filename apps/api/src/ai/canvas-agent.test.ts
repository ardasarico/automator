import { describe, expect, test } from "bun:test";
import { aiStoppedDetail, type AiStreamEvent } from "@automator/contracts";
import {
  LanguageModelError,
  scriptedModel,
  type ChatResponse,
  type LanguageModel,
} from "@automator/flow-engine";
import { runCanvasAgent } from "./canvas-agent";
import { VerificationTimeoutError } from "./verify-flow";

const call = (id: string, name: string, args: Record<string, unknown>) => ({
  id,
  name,
  arguments: args,
});

function turn(content: string | null, ...toolCalls: ReturnType<typeof call>[]): ChatResponse {
  return { content, toolCalls };
}

async function run(
  turns: ChatResponse[],
  options: {
    text?: string;
    current?: Parameters<typeof runCanvasAgent>[0]["current"];
    /** A model of its own, for the turns a script cannot express — a streamed answer. */
    model?: LanguageModel;
    signal?: AbortSignal;
  } = {},
) {
  const { model, requests } = scriptedModel(turns);
  const events: AiStreamEvent[] = [];
  const parts = await runCanvasAgent({
    model: options.model ?? model,
    text: options.text ?? "Post hi to Discord when I run it",
    current: options.current,
    ...(options.signal ? { signal: options.signal } : {}),
    history: [],
    emit: (event) => events.push(event),
    verificationBudget: 2000,
  });
  return { parts, events, requests };
}

const pingFlow: Parameters<typeof runCanvasAgent>[0]["current"] = {
  version: 1,
  name: "Ping",
  description: "",
  nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

describe("canvas agent", () => {
  test("builds a flow through tools, checks it and proposes it", async () => {
    const { parts, events } = await run([
      turn(
        "Adding a manual trigger and a Discord message.",
        call("c1", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
        call("c2", "add_node", {
          id: "d",
          type: "notify.discord",
          label: "Post",
          config: { content: "hi" },
        }),
        call("c3", "connect", {
          source: "t",
          sourceHandle: "run",
          target: "d",
          targetHandle: "message",
        }),
      ),
      turn(
        "Done. Fill in the webhook URL before running it.",
        call("c4", "suggest_next", { items: ["Add a condition"] }),
      ),
      turn("Ready."),
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "text.delta",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "text.delta",
      "tool.call",
      "tool.result",
      "suggestions",
      "text.delta",
      "status",
      "proposal",
    ]);
    const proposal = events.find((event) => event.type === "proposal");
    expect(proposal).toMatchObject({ replaces: true });
    // Arrival order, so a reload renders the turn exactly as the stream did.
    expect(parts.map((part) => part.type)).toEqual([
      "text",
      "tool",
      "tool",
      "tool",
      "text",
      "suggestions",
      "text",
      "proposal",
    ]);
    expect(parts.at(-1)).toMatchObject({ type: "proposal", state: "pending" });
    expect(parts.find((part) => part.type === "suggestions")).toEqual({
      type: "suggestions",
      items: ["Add a condition"],
    });
  });

  test("a rejected tool call returns its problem and the loop continues", async () => {
    const { parts, events, requests } = await run([
      turn(
        null,
        call("c1", "add_node", { id: "t", type: "trigger.rocket", label: "Run", config: {} }),
      ),
      turn(
        null,
        call("c2", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
      ),
      turn("A trigger alone."),
    ]);
    expect(events[1]).toMatchObject({ type: "tool.result", id: "c1", ok: false });
    const toolMessage = requests[1]!.messages.at(-1)!;
    expect(toolMessage.role).toBe("tool");
    expect(toolMessage.content).toMatch(/Unknown node type "trigger.rocket"/);
    expect(parts[0]).toMatchObject({ type: "tool", ok: false });
    expect(parts.at(-1)).toMatchObject({ type: "proposal" });
  });

  test("ask_user ends the turn with a question and no proposal", async () => {
    const { parts, events } = await run([
      turn(
        "One thing first.",
        call("c1", "ask_user", {
          question: "Which chain?",
          options: ["Base Sepolia", "World Chain Sepolia"],
        }),
      ),
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "text.delta",
      "tool.call",
      "tool.result",
      "question",
    ]);
    expect(parts.some((part) => part.type === "proposal")).toBe(false);
    expect(parts.at(-1)).toEqual({
      type: "question",
      text: "Which chain?",
      options: ["Base Sepolia", "World Chain Sepolia"],
    });
  });

  test("a refused conversation tool is stored, so a reload shows the refusal", async () => {
    const { parts } = await run([
      turn(null, call("c1", "ask_user", { question: "   ", options: [] })),
      turn(
        null,
        call("c2", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
      ),
      turn("Built it."),
    ]);
    expect(parts[0]).toMatchObject({ type: "tool", name: "ask_user", ok: false });
    expect(parts.at(-1)).toMatchObject({ type: "proposal" });
  });

  test("suggestions still reach the stream when a question ends the batch", async () => {
    const { parts, events } = await run([
      turn(
        "Here you go.",
        call("c1", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
        call("c2", "suggest_next", { items: ["Add a condition"] }),
        call("c3", "ask_user", { question: "Which chain?", options: ["Base Sepolia"] }),
      ),
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "text.delta",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "suggestions",
      "question",
    ]);
    expect(parts.map((part) => part.type)).toEqual(["text", "tool", "suggestions", "question"]);
    expect(parts.some((part) => part.type === "proposal")).toBe(false);
  });

  test("a prose-only turn makes no proposal", async () => {
    const { parts, events } = await run([turn("This flow posts to Discord when you run it.")], {
      text: "What does this flow do?",
      current: pingFlow,
    });
    expect(events.every((event) => event.type === "text.delta")).toBe(true);
    expect(events.map((event) => (event.type === "text.delta" ? event.delta : "")).join("")).toBe(
      "This flow posts to Discord when you run it.",
    );
    expect(parts).toEqual([{ type: "text", text: "This flow posts to Discord when you run it." }]);
  });

  test("a model that streams emits one event per delta and stores the joined text", async () => {
    const { parts, events } = await run([], {
      text: "What does this flow do?",
      current: pingFlow,
      model: async (request) => {
        request.onText?.("Hel");
        request.onText?.("lo");
        return { content: "Hello", toolCalls: [] };
      },
    });
    expect(events).toEqual([
      { type: "text.delta", delta: "Hel" },
      { type: "text.delta", delta: "lo" },
    ]);
    expect(parts).toEqual([{ type: "text", text: "Hello" }]);
  });

  test("a delta that arrives after its hop has ended is ignored", async () => {
    const { parts, events } = await run([], {
      text: "What does this flow do?",
      current: pingFlow,
      model: async (request) => {
        request.onText?.("Hello");
        setTimeout(() => request.onText?.(" again"), 0);
        return { content: "Hello", toolCalls: [] };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual([{ type: "text.delta", delta: "Hello" }]);
    expect(parts).toEqual([{ type: "text", text: "Hello" }]);
  });

  test("document checks that fail get one repair, then the draft is offered with a failed check", async () => {
    const { parts, events, requests } = await run([
      // A node with no trigger: the document check rejects it at the end of the turn.
      turn(
        null,
        call("c1", "add_node", {
          id: "d",
          type: "notify.discord",
          label: "Post",
          config: { content: "hi" },
        }),
      ),
      turn("Done."),
      // The repair turn changes nothing.
      turn("I cannot fix that."),
    ]);
    expect(
      events
        .filter((event) => event.type === "status")
        .map((event) => (event as { phase: string }).phase),
    ).toEqual(["checking", "repairing", "checking"]);
    expect(requests[2]!.messages.at(-1)!.content).toMatch(/not a valid flow/);
    /* Prose from either side of the repair is one part, and the stream carries the join. */
    expect(
      events.filter((event) => event.type === "text.delta").map((event) => event.delta),
    ).toEqual(["Done.", "\n\n", "I cannot fix that."]);
    expect(parts[1]).toEqual({ type: "text", text: "Done.\n\nI cannot fix that." });
    const proposal = parts.at(-1);
    expect(proposal).toMatchObject({
      type: "proposal",
      verification: { checks: [{ status: "failed" }] },
    });
  });

  test("the tool call cap ends the turn", async () => {
    const calls = Array.from({ length: 41 }, (_, index) =>
      turn(null, call(`c${index}`, "set_flow", { description: `v${index}` })),
    );
    const { parts } = await run(calls);
    expect(parts.filter((part) => part.type === "tool")).toHaveLength(40);
    expect(parts.find((part) => part.type === "error")).toMatchObject({ error: "invalid_flow" });
  });

  test("history and context reach the model", async () => {
    const { requests } = await (async () => {
      const { model, requests } = scriptedModel([turn("ok")]);
      await runCanvasAgent({
        model,
        text: "fix it",
        history: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "earlier ask" }],
            createdAt: "2026-09-11T00:00:00.000Z",
          },
          {
            id: "m2",
            role: "assistant",
            parts: [
              { type: "text", text: "earlier answer" },
              {
                type: "tool",
                id: "x",
                name: "add_node",
                args: { id: "t" },
                ok: true,
                detail: "Added t",
              },
            ],
            createdAt: "2026-09-11T00:00:01.000Z",
          },
        ],
        context: {
          selection: ["t"],
          problems: [{ severity: "error", nodeId: "t", message: '"Run": needs an edge' }],
        },
        emit: () => {},
      });
      return { requests };
    })();
    const messages = requests[0]!.messages;
    expect(messages[0]!.role).toBe("system");
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(messages.at(-1)!.content).toMatch(/Selected nodes: t/);
    expect(messages.at(-1)!.content).toMatch(/needs an edge/);
  });

  test("a spent deadline surfaces a timeout without another hop", async () => {
    const { model, requests } = scriptedModel([turn("Ready.")]);
    const failure = await runCanvasAgent({
      model,
      text: "build me a flow",
      history: [],
      emit: () => {},
      deadlineAt: Date.now() - 1,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(LanguageModelError);
    expect((failure as LanguageModelError).kind).toBe("timeout");
    expect(requests).toEqual([]);
  });

  test("a verification timeout still delivers the proposal with a warning", async () => {
    const { model } = scriptedModel([
      turn(
        "Adding the trigger.",
        call("c1", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
      ),
      turn("Done."),
    ]);
    const parts = await runCanvasAgent({
      model,
      text: "Add a manual trigger",
      history: [],
      emit: () => {},
      verify: () => {
        throw new VerificationTimeoutError("the checks ran past their budget");
      },
    });
    const proposal = parts.find((part) => part.type === "proposal");
    expect(proposal).toBeDefined();
    expect(proposal!.verification.warnings[0]).toMatch(
      /^The automatic checks did not finish in time/,
    );
  });

  test("a stop reaches the model and ends the turn with the shared wording", async () => {
    const controller = new AbortController();
    let given: AbortSignal | undefined;
    const model: LanguageModel = (request) =>
      new Promise((_resolve, reject) => {
        given = request.signal;
        request.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
        controller.abort();
      });
    const { parts, events } = await run([], { model, signal: controller.signal });

    expect(given).toBe(controller.signal);
    const stopped: AiStreamEvent = {
      type: "error",
      error: "unavailable",
      detail: aiStoppedDetail,
    };
    expect(parts).toEqual([stopped]);
    expect(events.at(-1)).toEqual(stopped);
  });

  test("a stop is not reported as a model failure", async () => {
    const controller = new AbortController();
    const model: LanguageModel = async () => {
      controller.abort();
      throw new LanguageModelError("upstream", "OpenRouter answered 500");
    };
    const { parts } = await run([], { model, signal: controller.signal });

    expect(parts).toEqual([{ type: "error", error: "unavailable", detail: aiStoppedDetail }]);
  });
});
