import { describe, expect, test } from "bun:test";
import { describeValue, nodeRunScope, templatePaths, templateValue } from "./run-values";

const document = {
  edges: [
    {
      id: "1",
      source: "form",
      target: "notify",
      sourceHandle: "submitted",
      targetHandle: "message",
    },
    { id: "2", source: "wait", target: "notify", sourceHandle: "done", targetHandle: "input" },
  ],
};

const run = {
  variables: { total: 0, note: "" },
  trigger: { nodeId: "t", payload: { openedAt: "2026-09-08T10:00:00.000Z" } },
  nodes: [
    { nodeId: "form", status: "succeeded" as const, outputs: { submitted: { email: "a@b.c" } } },
    { nodeId: "wait", status: "failed" as const, outputs: { done: true } },
  ],
};

describe("templatePaths", () => {
  test("lists each distinct path once", () => {
    expect(templatePaths("Hi {{ input.message.email }}, {{vars.total}} {{vars.total}}")).toEqual([
      "input.message.email",
      "vars.total",
    ]);
    expect(templatePaths("no templates")).toEqual([]);
  });
});

describe("nodeRunScope", () => {
  test("keys upstream outputs by target handle and drops nodes that did not succeed", () => {
    const scope = nodeRunScope(run, document, "notify");
    expect(scope.input).toEqual({ message: { email: "a@b.c" } });
    expect(scope.vars).toEqual({ total: 0, note: "" });
  });
});

describe("templateValue", () => {
  const scope = nodeRunScope(run, document, "notify");
  const value = (path: string) => templateValue(scope, run.trigger.payload, path);

  test("keeps falsy values apart from missing ones", () => {
    expect(value("vars.total")).toEqual({ status: "value", text: "0" });
    expect(value("vars.note")).toEqual({ status: "value", text: "empty text" });
    expect(value("vars.absent")).toEqual({ status: "missing" });
    expect(value("input.input")).toEqual({ status: "missing" });
  });

  test("resolves nested input and trigger paths", () => {
    expect(value("input.message.email")).toEqual({ status: "value", text: "“a@b.c”" });
    expect(value("trigger.openedAt")).toEqual({
      status: "value",
      text: "“2026-09-08T10:00:00.000Z”",
    });
  });

  test("never shows a secret", () => {
    expect(value("secrets.discord")).toEqual({ status: "secret" });
  });

  test("ignores unknown roots", () => {
    expect(value("whatever.total")).toEqual({ status: "missing" });
  });
});

describe("describeValue", () => {
  test("formats each kind of value", () => {
    expect(describeValue(false)).toEqual({ status: "value", text: "false" });
    expect(describeValue(null)).toEqual({ status: "value", text: "null" });
    expect(describeValue({ a: 1 })).toEqual({ status: "value", text: '{"a":1}' });
    const long = describeValue("x".repeat(200));
    expect(long.status === "value" && long.text.includes("…")).toBe(true);
  });
});
