import type { FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  findSimulationTrigger,
  simulationTriggerPayload,
  startingTriggers,
} from "./trigger-payload";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

describe("startingTriggers", () => {
  test("lists every trigger nothing is wired into, in canvas order", () => {
    const nodes = [
      node("schedule", "trigger.schedule"),
      node("app", "trigger.miniapp-open"),
      node("screen", "screen.form"),
      node("chained", "trigger.manual"),
    ];
    expect(
      startingTriggers(nodes, [{ target: "screen" }, { target: "chained" }]).map(
        (trigger) => trigger.id,
      ),
    ).toEqual(["schedule", "app"]);
  });

  test("a flow with no trigger starts from nothing", () => {
    expect(startingTriggers([node("w", "logic.wait")], [])).toEqual([]);
  });
});

describe("simulationTriggerPayload", () => {
  test("sends the starting trigger's parsed sample", () => {
    const nodes = [
      node("hook", "trigger.webhook", { samplePayload: '{"method":"POST","body":{"id":7}}' }),
      node("d", "notify.discord"),
    ];
    expect(simulationTriggerPayload(nodes, [{ target: "d" }])).toEqual({
      method: "POST",
      body: { id: 7 },
    });
  });

  test("skips a trigger that has an incoming edge", () => {
    const nodes = [
      node("second", "trigger.manual", { samplePayload: '{"from":"second"}' }),
      node("first", "trigger.webhook", { samplePayload: '{"from":"first"}' }),
    ];
    expect(findSimulationTrigger(nodes, [{ target: "second" }])?.id).toBe("first");
    expect(simulationTriggerPayload(nodes, [{ target: "second" }])).toEqual({ from: "first" });
  });

  test("a trigger whose sample was never edited uses its schema's default sample", () => {
    expect(simulationTriggerPayload([node("w", "trigger.webhook")], [])).toEqual({
      method: "POST",
      headers: { "content-type": "application/json" },
      query: {},
      body: {},
    });
    expect(simulationTriggerPayload([node("t", "trigger.manual")], [])).toEqual({});
    expect(
      (simulationTriggerPayload([node("e", "trigger.onchain-event")], []) as { event: string })
        .event,
    ).toBe("Transfer");
  });

  test("a requested trigger overrides the first, and an unusable request falls back to it", () => {
    const nodes = [
      node("schedule", "trigger.schedule", { samplePayload: '{"from":"schedule"}' }),
      node("app", "trigger.miniapp-open", { samplePayload: '{"from":"app"}' }),
      node("chained", "trigger.manual", { samplePayload: '{"from":"chained"}' }),
    ];
    const edges = [{ target: "chained" }];
    expect(findSimulationTrigger(nodes, edges, "app")?.id).toBe("app");
    expect(simulationTriggerPayload(nodes, edges, "app")).toEqual({ from: "app" });
    // A trigger that cannot start the flow, or a node that is gone, still runs the flow.
    expect(findSimulationTrigger(nodes, edges, "chained")?.id).toBe("schedule");
    expect(findSimulationTrigger(nodes, edges, "deleted")?.id).toBe("schedule");
    expect(simulationTriggerPayload(nodes, edges, null)).toEqual({ from: "schedule" });
  });

  test("falls back to an empty object without a trigger, a blank sample, or valid JSON", () => {
    expect(simulationTriggerPayload([node("w", "logic.wait")], [])).toEqual({});
    expect(
      simulationTriggerPayload([node("w", "trigger.webhook", { samplePayload: "" })], []),
    ).toEqual({});
    expect(
      simulationTriggerPayload([node("t", "trigger.manual", { samplePayload: "{nope" })], []),
    ).toEqual({});
  });
});
