import type { FlowDocumentInput } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createAiStore, historyOf } from "./ai-store";

const document: FlowDocumentInput = {
  version: 1,
  name: "Ping",
  description: "A manual run.",
  nodes: [{ id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

describe("ai store", () => {
  test("keeps user and assistant turns in order and answers land on the pending request", () => {
    const store = createAiStore();
    const ask = store.getState().ask("make a webhook flow");
    expect(store.getState().pending).toBe(true);
    store.getState().answer(ask, { kind: "flow", document, summary: "A webhook flow." });
    const turns = store.getState().turns;
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(turns[1]).toMatchObject({
      text: "A webhook flow.",
      proposal: { document, replaces: false, state: "pending" },
    });
    expect(store.getState().pending).toBe(false);

    const again = store.getState().ask("why a webhook?");
    store.getState().answer(again, { kind: "message", text: "Because you asked." });
    expect(store.getState().turns.at(-1)).toMatchObject({
      role: "assistant",
      text: "Because you asked.",
    });
    expect(store.getState().turns.at(-1)).not.toHaveProperty("proposal");
  });

  test("a flow answer without a summary falls back to the document description or name", () => {
    const store = createAiStore();
    const ask = store.getState().ask("x");
    store.getState().answer(ask, { kind: "flow", document, summary: "" }, { replaces: true });
    expect(store.getState().turns[1]).toMatchObject({
      text: "A manual run.",
      proposal: { replaces: true },
    });
  });

  test("applying one proposal marks the other pending ones stale; discarding is local", () => {
    const store = createAiStore();
    const first = store.getState().ask("one");
    store.getState().answer(first, { kind: "flow", document, summary: "one" });
    const second = store.getState().ask("two");
    store.getState().answer(second, { kind: "flow", document, summary: "two" });
    const third = store.getState().ask("three");
    store.getState().answer(third, { kind: "flow", document, summary: "three" });
    const ids = () =>
      store
        .getState()
        .turns.flatMap((turn) =>
          turn.role === "assistant" && turn.proposal ? [[turn.id, turn.proposal.state]] : [],
        );
    const [a, b, c] = ids().map(([id]) => id!);
    store.getState().discard(a!);
    expect(ids().map(([, state]) => state)).toEqual(["discarded", "pending", "pending"]);
    store.getState().apply(c!);
    expect(ids().map(([, state]) => state)).toEqual(["discarded", "stale", "applied"]);
    // Applying again does not touch what was already settled.
    store.getState().apply(b!);
    expect(ids().map(([, state]) => state)).toEqual(["discarded", "applied", "applied"]);
  });

  test("failures become assistant turns and stay out of the history", () => {
    const store = createAiStore();
    const ask = store.getState().ask("x");
    store.getState().fail(ask, "AI is not available right now.");
    expect(store.getState().turns[1]).toMatchObject({
      role: "assistant",
      error: true,
      text: "AI is not available right now.",
    });
    expect(store.getState().pending).toBe(false);
    expect(historyOf(store.getState().turns)).toEqual([{ role: "user", text: "x" }]);
  });

  test("clearing drops the thread, the pending flag and any answer still on its way", () => {
    const store = createAiStore();
    const ask = store.getState().ask("x");
    store.getState().clear();
    expect(store.getState().turns).toEqual([]);
    expect(store.getState().pending).toBe(false);
    store.getState().answer(ask, { kind: "message", text: "late" });
    store.getState().fail(ask, "late failure");
    expect(store.getState().turns).toEqual([]);
  });

  test("the history is the user's texts and the assistant's summaries, capped at 40", () => {
    const store = createAiStore();
    for (let index = 0; index < 25; index += 1) {
      const ask = store.getState().ask(`ask ${index}`);
      store.getState().answer(ask, { kind: "flow", document, summary: `summary ${index}` });
    }
    const history = historyOf(store.getState().turns);
    expect(history).toHaveLength(40);
    expect(history[0]).toEqual({ role: "user", text: "ask 5" });
    expect(history.at(-1)).toEqual({ role: "assistant", text: "summary 24" });
    expect(history.some((turn) => "document" in turn)).toBe(false);
  });

  test("focus requests count up so the panel can react to each one", () => {
    const store = createAiStore();
    store.getState().requestFocus();
    store.getState().requestFocus();
    expect(store.getState().focusRequests).toBe(2);
  });
});
