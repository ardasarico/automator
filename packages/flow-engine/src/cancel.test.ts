import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";

const document: FlowDocument = {
  version: 1,
  id: "flow",
  name: "Cancel",
  description: "",
  nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
    {
      id: "wait",
      type: "logic.wait",
      position: { x: 1, y: 0 },
      label: "Wait",
      config: { seconds: 5 },
    },
    {
      id: "set",
      type: "logic.set-variable",
      position: { x: 2, y: 0 },
      label: "Set",
      config: { name: "x", value: "1" },
    },
  ],
  edges: [
    { id: "e1", source: "start", sourceHandle: "run", target: "wait", targetHandle: "in" },
    { id: "e2", source: "wait", sourceHandle: "done", target: "set", targetHandle: "value" },
  ],
};

describe("cancelling a run", () => {
  test("an aborted signal stops the node in flight and skips the rest", async () => {
    const controller = new AbortController();
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const pending = runFlow(document, { signal: controller.signal, sleep });
    setTimeout(() => controller.abort(), 10);
    const run = await pending;
    expect(run.status).toBe("failed");
    expect(run.error).toBe("The run was cancelled.");
    expect(run.nodes.map((node) => node.status)).toEqual(["succeeded", "failed", "skipped"]);
    expect(run.nodes[1]?.error).toBe("The run was cancelled.");
  });

  test("a signal already aborted runs nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = await runFlow(document, { signal: controller.signal, sleep: async () => {} });
    expect(run.status).toBe("failed");
    expect(run.error).toBe("The run was cancelled.");
    expect(run.nodes.every((node) => node.status === "skipped")).toBe(true);
  });

  test("without a signal the run completes as before", async () => {
    const run = await runFlow(document, { sleep: async () => {} });
    expect(run.status).toBe("succeeded");
    expect(run.variables).toEqual({ x: "1" });
  });
});
