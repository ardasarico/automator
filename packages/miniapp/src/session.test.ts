import type { FlowDocument, FlowNode, FlowRun } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { continueSession, openSession, settleRun, visitorOutput } from "./session";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

/** trigger → form → discord → page. */
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
    ).toEqual({ kind: "failed", nodeId: "d", error: "Boom" });
    expect(settleRun(baseRun({ status: "failed", error: "Bad graph" }))).toEqual({
      kind: "failed",
      nodeId: null,
      error: "Bad graph",
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
