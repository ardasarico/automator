import { expect, test } from "bun:test";
import type { FlowDocument, FlowRun } from "@automator/contracts";
import { screenScope } from "./screen-scope";

test("screen inputs match fired explicit and implicit edges, excluding the branch not taken", () => {
  const document: Pick<FlowDocument, "edges"> = {
    edges: [
      {
        id: "a",
        source: "form",
        sourceHandle: "submitted",
        target: "screen",
        targetHandle: "data",
      },
      {
        id: "b",
        source: "branch",
        sourceHandle: "false",
        target: "screen",
        targetHandle: "unused",
      },
      { id: "c", source: "branch", target: "screen", targetHandle: "implicit" },
    ],
  };
  const run: Pick<FlowRun, "nodes" | "variables" | "trigger"> = {
    nodes: [
      { nodeId: "form", status: "succeeded", outputs: { submitted: { count: "4" } } },
      { nodeId: "branch", status: "succeeded", outputs: { true: { count: "4" } } },
    ],
    variables: { name: "demo" },
    trigger: { nodeId: "open", payload: { openedAt: "today" } },
  };
  expect(screenScope(document, run, "screen")).toEqual({
    input: { data: { count: "4" }, implicit: { count: "4" } },
    vars: { name: "demo" },
    trigger: { openedAt: "today" },
  });
  run.nodes[1]!.outputs = { a: 1, b: 2 };
  expect(screenScope(document, run, "screen").input.implicit).toEqual({ a: 1, b: 2 });
});
