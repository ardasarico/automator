import { describe, expect, test } from "bun:test";
import type { AiMessage } from "@automator/contracts";
import { applyEvent } from "./apply-event";

const empty: AiMessage = {
  id: "m",
  role: "assistant",
  parts: [],
  createdAt: "2026-09-11T00:00:00.000Z",
};
const document = { version: 1 as const, name: "Ping", description: "", nodes: [], edges: [] };

describe("applyEvent", () => {
  test("text deltas grow one text part", () => {
    let message = applyEvent(empty, { type: "text.delta", delta: "Hel" });
    message = applyEvent(message, { type: "text.delta", delta: "lo" });
    expect(message.parts).toEqual([{ type: "text", text: "Hello" }]);
  });
  test("a tool call opens a step and its result closes it", () => {
    let message = applyEvent(empty, {
      type: "tool.call",
      id: "c1",
      name: "add_node",
      args: { id: "t" },
    });
    expect(message.parts[0]).toEqual({
      type: "tool",
      id: "c1",
      name: "add_node",
      args: { id: "t" },
    });
    message = applyEvent(message, {
      type: "tool.result",
      id: "c1",
      ok: true,
      detail: "Added t",
      document,
    });
    expect(message.parts[0]).toMatchObject({ ok: true, detail: "Added t" });
  });
  test("text after a tool starts a new text part", () => {
    let message = applyEvent(empty, { type: "text.delta", delta: "One." });
    message = applyEvent(message, { type: "tool.call", id: "c1", name: "set_flow", args: {} });
    message = applyEvent(message, { type: "text.delta", delta: "Two." });
    expect(message.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
  });
  test("question, proposal, suggestions and error become parts", () => {
    let message = applyEvent(empty, { type: "question", text: "Which?", options: ["A"] });
    message = applyEvent(message, {
      type: "proposal",
      document,
      verification: { checks: [], warnings: [] },
      replaces: true,
    });
    message = applyEvent(message, { type: "suggestions", items: ["Next"] });
    message = applyEvent(message, { type: "error", error: "unavailable" });
    expect(message.parts.map((part) => part.type)).toEqual([
      "question",
      "proposal",
      "suggestions",
      "error",
    ]);
    expect(message.parts[1]).toMatchObject({ state: "pending" });
  });
  test("message, status and done change nothing", () => {
    expect(applyEvent(empty, { type: "status", phase: "checking" })).toBe(empty);
    expect(applyEvent(empty, { type: "done" })).toBe(empty);
  });
});
