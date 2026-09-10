import type { FlowDocument, FlowNode, FlowRun } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { continueSession, openSession, settleRun, visitorOutput } from "./session";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Signup",
  description: "",
  nodes: [
    node("t", "trigger.miniapp-open"),
    node("form", "screen.form"),
    node("d", "notify.discord", {
      webhookUrl: "https://discord.com/api/webhooks/1/abc",
      content: "Hi {{input.message.name}}",
    }),
    node("done", "screen.page"),
  ],
  edges: [
    { id: "1", source: "t", target: "form", sourceHandle: "visitor", targetHandle: "data" },
    { id: "2", source: "form", target: "d", sourceHandle: "submitted", targetHandle: "message" },
    { id: "3", source: "d", target: "done", sourceHandle: "sent", targetHandle: "data" },
  ],
};

const engine = {
  sleep: async () => {},
  fetch: (async () => Response.json({ id: "m1", channel_id: "c1" })) as unknown as typeof fetch,
};

function baseRun(overrides: Partial<FlowRun>): FlowRun {
  return {
    id: "r",
    flowId: "f",
    status: "succeeded",
    startedAt: "",
    finishedAt: "",
    trigger: { nodeId: null },
    nodes: [],
    variables: {},
    ...overrides,
  };
}

describe("settleRun", () => {
  test("maps waiting, succeeded and failed runs to session states", () => {
    expect(
      settleRun(baseRun({ status: "waiting", nodes: [{ nodeId: "form", status: "waiting" }] })),
    ).toEqual({ kind: "screen", nodeId: "form" });
    expect(settleRun(baseRun({ status: "succeeded" }))).toEqual({ kind: "end" });
    expect(
      settleRun(
        baseRun({ status: "failed", nodes: [{ nodeId: "d", status: "failed", error: "Boom" }] }),
      ),
    ).toEqual({
      kind: "failed",
      nodeId: "d",
      error: "Boom",
      message: "This app hit a problem and could not continue.",
    });
    expect(settleRun(baseRun({ status: "failed", error: "Bad graph" }))).toEqual({
      kind: "failed",
      nodeId: null,
      error: "Bad graph",
      message: "This app hit a problem and could not continue.",
    });
  });

  test("keeps the node's error for the owner and adds a visitor-safe sentence for funds", () => {
    const paying: FlowDocument = {
      ...document,
      nodes: document.nodes.map((entry) =>
        entry.id === "d" ? { ...entry, type: "usdc.payout" as const, label: "Send USDC" } : entry,
      ),
    };
    const error =
      "Server signing is not enabled for this wallet; enable the configured app signer from the builder";
    const settled = settleRun(
      baseRun({ status: "failed", nodes: [{ nodeId: "d", status: "failed", error }] }),
      paying,
    );
    expect(settled).toEqual({
      kind: "failed",
      nodeId: "d",
      error,
      message: "This app can't send funds right now. Its owner has to finish setting it up first.",
    });
  });
});

describe("visitorOutput", () => {
  test("hands over form data, otherwise the port taken", () => {
    expect(visitorOutput("submitted", { name: "Ada" })).toEqual({ name: "Ada" });
    expect(visitorOutput("cancelled")).toEqual({ action: "cancelled" });
  });
});

describe("openSession and continueSession", () => {
  test("continuation forwards previously completed outputs to a join", async () => {
    const branched: FlowDocument = {
      ...document,
      nodes: [
        node("t", "trigger.miniapp-open"),
        node("a", "logic.set-variable", { name: "a", value: "A" }),
        node("page", "screen.page"),
        node("join", "logic.merge", { mode: "list" }),
      ],
      edges: [
        { id: "1", source: "t", sourceHandle: "visitor", target: "a", targetHandle: "value" },
        { id: "2", source: "t", sourceHandle: "visitor", target: "page", targetHandle: "data" },
        { id: "3", source: "a", sourceHandle: "value", target: "join", targetHandle: "a" },
        { id: "4", source: "page", sourceHandle: "next", target: "join", targetHandle: "b" },
      ],
    };
    const opened = await openSession(branched, {}, engine)!;
    const resumed = await continueSession(branched, {}, engine, {
      nodeId: "page",
      port: "next",
      variables: opened.variables,
      completed: opened.nodes,
    });
    expect(resumed.status).toBe("succeeded");
    expect(resumed.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
      merged: ["A", { action: "next" }],
    });
  });

  test("opens at the first screen, then runs the real steps on continue", async () => {
    const opened = await openSession(document, { openedAt: "now" }, engine)!;
    expect(settleRun(opened)).toEqual({ kind: "screen", nodeId: "form" });

    const seen: string[] = [];
    const resumed = await continueSession(
      document,
      { openedAt: "now" },
      engine,
      { nodeId: "form", port: "submitted", data: { name: "Ada" }, variables: opened.variables },
      (result) => seen.push(`${result.nodeId}:${result.status}`),
    );
    expect(settleRun(resumed)).toEqual({ kind: "screen", nodeId: "done" });
    expect(seen).toEqual(["t:skipped", "form:succeeded", "d:succeeded", "done:waiting"]);
  });

  test("is null without a mini-app trigger", () => {
    expect(openSession({ ...document, nodes: document.nodes.slice(1) }, {}, engine)).toBeNull();
  });
});
