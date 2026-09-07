import type { FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { countErrors, findFlowProblems } from "./validation";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

describe("findFlowProblems", () => {
  test("an empty flow and a flow without a trigger are errors", () => {
    expect(findFlowProblems({ nodes: [], edges: [] })).toEqual([
      { severity: "error", message: "The flow is empty. Add a trigger to start from." },
    ]);
    expect(findFlowProblems({ nodes: [node("page", "screen.page")], edges: [] })).toMatchObject([
      { severity: "error", message: "The flow has no trigger to start from." },
    ]);
  });

  test("a consistent flow has no problems", () => {
    const problems = findFlowProblems({
      nodes: [node("open", "trigger.manual"), node("page", "screen.page", { title: "Hi" })],
      edges: [
        { id: "e", source: "open", target: "page", sourceHandle: "run", targetHandle: "data" },
      ],
    });
    expect(problems).toEqual([]);
  });

  test("nodes no trigger reaches are warned about", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("page", "screen.page"),
        node("lonely", "logic.wait"),
      ],
      edges: [{ id: "e", source: "open", target: "page" }],
    });
    expect(problems).toEqual([
      {
        severity: "warning",
        nodeId: "lonely",
        message: "“lonely” is not connected to a trigger, so it never runs.",
      },
    ]);
  });

  test("required config is an error and a blank secret a warning that says set your own", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("set", "logic.set-variable", { name: " " }),
        node("post", "notify.discord", { webhookUrl: "", content: "hi" }),
      ],
      edges: [
        { id: "e1", source: "open", target: "set" },
        { id: "e2", source: "set", target: "post" },
      ],
    });
    expect(problems).toEqual([
      { severity: "error", nodeId: "set", message: "“set” needs a variable name." },
      {
        severity: "warning",
        nodeId: "post",
        message: "“post” needs a Discord webhook URL: set your own.",
      },
    ]);
    expect(countErrors(problems)).toBe(1);
  });

  test("a World ID check needs an action and warns about an unwired Rejected port", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.miniapp-open"),
        node("verify", "world.id-verify"),
        node("ok", "screen.page"),
      ],
      edges: [
        { id: "e1", source: "open", target: "verify", sourceHandle: "visitor" },
        { id: "e2", source: "verify", target: "ok", sourceHandle: "verified" },
      ],
    });
    expect(problems).toEqual([
      { severity: "error", nodeId: "verify", message: "“verify” needs a World action id." },
      {
        severity: "warning",
        nodeId: "verify",
        message: "“verify” has nothing on Rejected, so a failed verification ends the flow.",
      },
    ]);
    const wired = findFlowProblems({
      nodes: [
        node("open", "trigger.miniapp-open"),
        node("verify", "world.id-verify", { action: "claim" }),
        node("ok", "screen.page"),
        node("no", "screen.page"),
      ],
      edges: [
        { id: "e1", source: "open", target: "verify", sourceHandle: "visitor" },
        { id: "e2", source: "verify", target: "ok", sourceHandle: "verified" },
        { id: "e3", source: "verify", target: "no", sourceHandle: "rejected" },
      ],
    });
    expect(wired).toEqual([]);
  });

  test("unreadable settings and empty forms are reported", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("wait", "logic.wait", { seconds: "soon" }),
        node("form", "screen.form"),
      ],
      edges: [
        { id: "e1", source: "open", target: "wait" },
        { id: "e2", source: "wait", target: "form" },
      ],
    });
    expect(problems.map((problem) => [problem.severity, problem.nodeId])).toEqual([
      ["error", "wait"],
      ["warning", "form"],
    ]);
  });

  test("structural problems short-circuit everything else", () => {
    const problems = findFlowProblems({
      nodes: [node("a", "trigger.manual"), node("a", "screen.page")],
      edges: [],
    });
    expect(problems).toEqual([{ severity: "error", message: 'Duplicate node id "a"' }]);
  });
});
