import type { AiMessage, AiProposalPart, AiRunContext } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createChatStore, selectPendingProposal } from "./chat-store";

const document = { version: 1 as const, name: "Ping", description: "", nodes: [], edges: [] };
const verification = { checks: [], warnings: [] };
const createdAt = "2026-09-11T00:00:00.000Z";

function userMessage(id: string, text: string): AiMessage {
  return { id, role: "user", parts: [{ type: "text", text }], createdAt };
}

function pendingProposal(): AiProposalPart {
  return { type: "proposal", document, verification, replaces: false, state: "pending" };
}

describe("chat store", () => {
  test("begin appends the user message and sets pending", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "make a webhook flow"));
    expect(store.getState().messages).toEqual([userMessage("u1", "make a webhook flow")]);
    expect(store.getState().pending).toBe(true);
  });

  test("receive({type: 'message'}) appends an empty assistant message and sets streamingId", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    expect(store.getState().streamingId).toBe("a1");
    expect(store.getState().messages.at(-1)).toMatchObject({
      id: "a1",
      role: "assistant",
      parts: [],
    });
  });

  test("receive routes other events through applyEvent onto the streaming message", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    store.getState().receive({ type: "text.delta", delta: "Hel" });
    store.getState().receive({ type: "text.delta", delta: "lo" });
    store.getState().receive({
      type: "tool.call",
      id: "c1",
      name: "add_node",
      args: {},
    });
    const message = store.getState().messages.at(-1);
    expect(message?.parts[0]).toEqual({ type: "text", text: "Hello" });
    expect(message?.parts[1]).toMatchObject({ type: "tool", id: "c1", name: "add_node" });
    // events target only the streaming message, never the user turn before it
    expect(store.getState().messages[0]).toEqual(userMessage("u1", "hi"));
  });

  test("a status event sets phase", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    store.getState().receive({ type: "status", phase: "checking" });
    expect(store.getState().phase).toBe("checking");
    // status carries no part onto the message
    expect(store.getState().messages.at(-1)?.parts).toEqual([]);
  });

  test("end clears pending, streamingId and phase", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    store.getState().receive({ type: "status", phase: "thinking" });
    store.getState().end();
    expect(store.getState().pending).toBe(false);
    expect(store.getState().streamingId).toBeNull();
    expect(store.getState().phase).toBeNull();
  });

  test("fail appends an error part to the streaming message and ends", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    store.getState().receive({ type: "text.delta", delta: "Working…" });
    store.getState().receive({ type: "status", phase: "checking" });
    store.getState().fail("unavailable", "no model");
    const last = store.getState().messages.at(-1);
    expect(last?.id).toBe("a1");
    expect(last?.parts.at(-1)).toEqual({ type: "error", error: "unavailable", detail: "no model" });
    expect(store.getState().pending).toBe(false);
    expect(store.getState().streamingId).toBeNull();
    expect(store.getState().phase).toBeNull();
  });

  test("fail creates a local assistant message when nothing is streaming", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().fail("unavailable");
    expect(store.getState().messages).toHaveLength(2);
    const last = store.getState().messages.at(-1);
    expect(last?.id).toBe("local-1");
    expect(last?.role).toBe("assistant");
    expect(last?.parts).toEqual([{ type: "error", error: "unavailable" }]);
  });

  test("fail without a streaming message mints a fresh local id each time", () => {
    const store = createChatStore();
    store.getState().begin(userMessage("u1", "one"));
    store.getState().fail("unavailable");
    store.getState().begin(userMessage("u2", "two"));
    store.getState().fail("unavailable");
    const ids = store.getState().messages.map((message) => message.id);
    expect(ids).toEqual(["u1", "local-1", "u2", "local-2"]);
  });

  test("begin marks every pending proposal in earlier messages stale", () => {
    const store = createChatStore();
    store.getState().load([{ id: "a1", role: "assistant", parts: [pendingProposal()], createdAt }]);
    store.getState().begin(userMessage("u2", "again"));
    expect(store.getState().messages[0]?.parts[0]).toMatchObject({ state: "stale" });
    // the new user message is untouched
    expect(store.getState().messages[1]).toEqual(userMessage("u2", "again"));
  });

  test("setProposalState updates the named message", () => {
    const store = createChatStore();
    store.getState().load([{ id: "a1", role: "assistant", parts: [pendingProposal()], createdAt }]);
    store.getState().setProposalState("a1", "applied");
    expect(store.getState().messages[0]?.parts[0]).toMatchObject({ state: "applied" });
  });

  test("setProposalState leaves messages that do not match untouched", () => {
    const store = createChatStore();
    const other: AiMessage = { id: "a2", role: "assistant", parts: [], createdAt };
    store
      .getState()
      .load([{ id: "a1", role: "assistant", parts: [pendingProposal()], createdAt }, other]);
    store.getState().setProposalState("a1", "discarded");
    expect(store.getState().messages[1]).toBe(other);
  });

  test("selectPendingProposal returns only the last message's pending proposal", () => {
    const store = createChatStore();
    const stale: AiProposalPart = { ...pendingProposal(), state: "stale" };
    const pending = pendingProposal();
    store.getState().load([
      { id: "a1", role: "assistant", parts: [stale], createdAt },
      { id: "a2", role: "assistant", parts: [pending], createdAt },
    ]);
    expect(selectPendingProposal(store.getState())).toEqual({ messageId: "a2", proposal: pending });
  });

  test("selectPendingProposal is null when the last message has no pending proposal", () => {
    const store = createChatStore();
    const pending = pendingProposal();
    store.getState().load([
      { id: "a1", role: "assistant", parts: [pending], createdAt },
      { id: "a2", role: "assistant", parts: [], createdAt },
    ]);
    expect(selectPendingProposal(store.getState())).toBeNull();
    expect(selectPendingProposal({ ...store.getState(), messages: [] })).toBeNull();
  });

  test("clear empties messages and context except selection", () => {
    const run: AiRunContext = { status: "succeeded", trigger: { nodeId: null }, nodes: [] };
    const store = createChatStore();
    store.getState().setContext({
      selection: ["n1"],
      problems: [{ severity: "error", message: "bad" }],
      run,
    });
    store.getState().begin(userMessage("u1", "hi"));
    store.getState().receive({ type: "message", id: "a1" });
    store.getState().clear();
    expect(store.getState().messages).toEqual([]);
    expect(store.getState().context).toEqual({ selection: ["n1"], problems: [] });
    expect(store.getState().pending).toBe(false);
    expect(store.getState().streamingId).toBeNull();
  });

  test("requestFocus counts up, and focusOnMount starts the counter at 1", () => {
    const store = createChatStore();
    expect(store.getState().focusRequests).toBe(0);
    store.getState().requestFocus();
    store.getState().requestFocus();
    expect(store.getState().focusRequests).toBe(2);

    const focused = createChatStore({ focusOnMount: true });
    expect(focused.getState().focusRequests).toBe(1);
  });

  test("setMode and setDraftPrompt update their fields directly", () => {
    const store = createChatStore();
    expect(store.getState().mode).toBe("edit");
    store.getState().setMode("new");
    expect(store.getState().mode).toBe("new");
    store.getState().setDraftPrompt("build a webhook flow");
    expect(store.getState().draftPrompt).toBe("build a webhook flow");
    store.getState().setDraftPrompt(null);
    expect(store.getState().draftPrompt).toBeNull();
  });

  test("load installs a stored conversation and marks it loaded", () => {
    const store = createChatStore();
    expect(store.getState().loaded).toBe(false);
    const messages = [userMessage("u1", "hi")];
    store.getState().load(messages);
    expect(store.getState().messages).toEqual(messages);
    expect(store.getState().loaded).toBe(true);
  });
});
