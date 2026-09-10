import type { FlowDocument, FlowNode, FlowNodeType, FlowRunSource } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runTriggerNode } from "./run-trigger";

function node(id: string, type: FlowNodeType): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: "", config: {} };
}

function document(...nodes: FlowNode[]): FlowDocument {
  return { version: 1, id: "flow-1", name: "Flow", description: "", nodes, edges: [] };
}

/** The resolved node's id, or null when nothing was resolved. */
function resolve(doc: FlowDocument, source: FlowRunSource, nodeId: string | null = null) {
  return runTriggerNode(doc, source, nodeId)?.node?.id ?? null;
}

describe("runTriggerNode", () => {
  test("uses the node the run recorded when it has one", () => {
    const doc = document(node("a", "trigger.webhook"), node("b", "trigger.schedule"));
    expect(resolve(doc, "schedule", "b")).toBe("b");
  });

  test("keeps a recorded id the document no longer carries, so it can be named removed", () => {
    const doc = document(node("a", "trigger.webhook"));
    expect(runTriggerNode(doc, "webhook", "gone")).toEqual({ id: "gone", node: null });
  });

  /* A mini-app session resumes from a screen, and the engine records no trigger node for a
   * resumed pass — but the mini-app trigger did fire, on the pass that opened the session. */
  test("names the mini-app trigger for a resumed session run that recorded no node", () => {
    const doc = document(node("open", "trigger.miniapp-open"), node("pay", "usdc.payment"));
    expect(resolve(doc, "miniapp")).toBe("open");
  });

  test("picks the trigger the run's source starts, not merely the first one", () => {
    const doc = document(node("hook", "trigger.webhook"), node("open", "trigger.miniapp-open"));
    expect(resolve(doc, "miniapp")).toBe("open");
    expect(resolve(doc, "webhook")).toBe("hook");
  });

  test("a watch run resolves either watch trigger", () => {
    expect(resolve(document(node("p", "trigger.price")), "watch")).toBe("p");
    expect(resolve(document(node("b", "trigger.balance")), "watch")).toBe("b");
  });

  test("falls back to the only trigger when the source names no type of its own", () => {
    const doc = document(node("t", "trigger.manual"), node("n", "notify.discord"));
    expect(resolve(doc, "manual")).toBe("t");
  });

  test("names nothing when the document carries no trigger at all", () => {
    expect(runTriggerNode(document(node("n", "notify.discord")), "miniapp", null)).toBeNull();
  });

  test("names nothing rather than guessing between equally likely triggers", () => {
    const doc = document(node("a", "trigger.webhook"), node("b", "trigger.schedule"));
    expect(runTriggerNode(doc, "manual", null)).toBeNull();
  });

  test("names nothing when the source's own trigger type is not on the canvas", () => {
    const doc = document(node("a", "trigger.webhook"), node("b", "trigger.schedule"));
    expect(runTriggerNode(doc, "miniapp", null)).toBeNull();
  });
});
