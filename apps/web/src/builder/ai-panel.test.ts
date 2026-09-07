import type { FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { diffNodes } from "./ai-panel";

const node = (id: string, type: FlowNode["type"], label: string, config = {}): FlowNode => ({
  id,
  type,
  label,
  config,
  position: { x: 0, y: 0 },
});

describe("diffNodes", () => {
  test("lists next nodes in order with their change, then removed ones", () => {
    const current = [
      node("a", "trigger.manual", "Run"),
      node("b", "logic.wait", "Wait"),
      node("c", "notify.discord", "Post"),
    ];
    const next = [
      node("a", "trigger.manual", "Run"),
      node("b", "logic.wait", "Wait", { seconds: 5 }),
      node("d", "screen.page", "Done"),
    ];
    expect(diffNodes(current, next).map((change) => [change.kind, change.id])).toEqual([
      ["kept", "a"],
      ["changed", "b"],
      ["added", "d"],
      ["removed", "c"],
    ]);
  });

  test("an empty canvas makes everything added", () => {
    expect(
      diffNodes([], [node("a", "trigger.manual", "Run")]).map((change) => change.kind),
    ).toEqual(["added"]);
  });
});
