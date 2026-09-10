import { describe, expect, test } from "bun:test";
import type { AiStreamEvent } from "@automator/contracts";
import { LanguageModelError, scriptedModel, type ChatResponse } from "@automator/flow-engine";
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
  options: { text?: string; current?: Parameters<typeof runCanvasAgent>[0]["current"] } = {},
) {
  const { model, requests } = scriptedModel(turns);
  const events: AiStreamEvent[] = [];
  const parts = await runCanvasAgent({
    model,
    text: options.text ?? "Post hi to Discord when I run it",
    current: options.current,
    history: [],
    emit: (event) => events.push(event),
    verificationBudget: 2000,
  });
  return { parts, events, requests };
}

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
    expect(parts.filter((part) => part.type === "text")).toHaveLength(1);
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

  test("a prose-only turn makes no proposal", async () => {
    const { parts, events } = await run([turn("This flow posts to Discord when you run it.")], {
      text: "What does this flow do?",
      current: {
        version: 1,
        name: "Ping",
        description: "",
        nodes: [
          {
            id: "t",
            type: "trigger.manual",
            position: { x: 0, y: 0 },
            label: "Run",
            config: {},
          },
        ],
        edges: [],
      },
    });
    expect(events).toEqual([
      { type: "text.delta", delta: "This flow posts to Discord when you run it." },
    ]);
    expect(parts).toEqual([{ type: "text", text: "This flow posts to Discord when you run it." }]);
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
});
