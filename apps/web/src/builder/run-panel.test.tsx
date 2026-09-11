/// <reference types="bun" />
import type { AiStreamEvent, FlowDocument, FlowRun } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
// The signing button needs Privy's provider, and its package does not load under bun test.
mock.module("./enable-signing-button", () => ({ EnableSigningButton: () => null }));

const { RunPanel } = await import("./run-panel");
const { ChatStoreProvider } = await import("./ai/chat-store-provider");
const { BuilderStoreProvider } = await import("./store-provider");
const { RunStoreProvider, useRunStore } = await import("./run-store-provider");
const { ReactFlowProvider } = await import("@xyflow/react");

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Ping",
  description: "",
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 300, y: 0 },
      label: "Post",
      config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi", username: "" },
    },
  ],
  edges: [{ id: "1", source: "t", target: "d", sourceHandle: "run", targetHandle: "message" }],
};
const run: FlowRun = {
  id: "r1",
  flowId: "f",
  status: "failed",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.000Z",
  trigger: { nodeId: "t", payload: { token: "abc" } },
  nodes: [
    { nodeId: "t", status: "succeeded", outputs: { run: {} } },
    { nodeId: "d", status: "failed", error: "Discord answered 401" },
  ],
  variables: {},
};

/* The explanation the API streams back for every Explain click in this file. */
const explanation: AiStreamEvent[] = [
  { type: "message", id: "m1" },
  { type: "text.delta", delta: "Discord refused the webhook." },
  { type: "done" },
];

let startRun: () => void;
function Probe() {
  const start = useRunStore((state) => state.start);
  useEffect(() => {
    startRun = start;
  }, [start]);
  return null;
}

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

function sseBody(events: readonly AiStreamEvent[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

beforeAll(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url: String(url),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    if (method === "POST")
      return new Response(sseBody(explanation), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    return Response.json({ messages: [] });
  }) as unknown as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});
beforeEach(() => {
  calls.length = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

const posts = () => calls.filter((call) => call.method === "POST");

async function mount(initialRun: FlowRun, initialDocument?: FlowDocument) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <RunStoreProvider initialRun={initialRun} initialDocument={initialDocument}>
          <ChatStoreProvider>
            <ReactFlowProvider>
              <RunPanel />
              <Probe />
            </ReactFlowProvider>
          </ChatStoreProvider>
        </RunStoreProvider>
      </BuilderStoreProvider>,
    );
  });
}

const explainButtons = () =>
  Array.from(container.querySelectorAll("button")).filter((button) =>
    button.textContent?.includes("Explain with AI"),
  );

describe("RunPanel", () => {
  test("a failed run offers Explain with AI in the title row and on the failed node", async () => {
    await mount(run);
    expect(explainButtons()).toHaveLength(2);
    expect(container.textContent).toContain("Discord answered 401");

    await act(async () => {
      explainButtons()[0]!.click();
    });

    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.url).toBe("/api/flows/f/ai/messages");
    const body = posts()[0]!.body as {
      text: string;
      document: FlowDocument;
      context: { run: { nodeId?: string; trigger: { payload: unknown } } };
    };
    expect(body.text).toBe('Explain why "Post" failed.');
    expect(body.context.run.nodeId).toBe("d");
    expect(body.context.run.trigger.payload).toEqual({ token: "[redacted]" });
    expect(body.document.nodes[1]!.config.webhookUrl).toBe("");
    expect(JSON.stringify(body)).not.toContain("discord.com/api/webhooks");
  });

  test("a succeeded run has no explain button", async () => {
    await mount({
      ...run,
      status: "succeeded",
      nodes: [
        { nodeId: "t", status: "succeeded", outputs: { run: {} } },
        { nodeId: "d", status: "succeeded", outputs: { sent: {} } },
      ],
    });
    expect(explainButtons()).toHaveLength(0);
  });

  test("historical run labels use the executed snapshot", async () => {
    const snapshot = structuredClone(document);
    snapshot.nodes[1]!.label = "Original notification";
    snapshot.nodes[1]!.config.content = "Original content";
    await mount(run, snapshot);
    expect(container.textContent).toContain("Original notification");
  });

  test("a running request cannot be cleared without stopping it", async () => {
    await mount(run);
    await act(async () => startRun());
    const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear run"]')!;
    expect(clear.disabled).toBe(true);
    await act(async () => clear.click());
    expect(container.querySelector('[aria-label="Last run"]')?.textContent).toContain("Running…");
  });

  test("transaction links use the historical chain after the canvas chain changes", async () => {
    const hash = `0x${"a".repeat(64)}`;
    await mount(
      {
        ...run,
        status: "succeeded",
        nodes: [{ nodeId: "t", status: "succeeded", outputs: { receipt: { hash } } }],
      },
      { ...document, chainId: 4801 },
    );
    const link = container.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toContain("View on World Chain Sepolia");
    expect(link.href).toBe(`https://worldchain-sepolia.explorer.alchemy.com/tx/${hash}`);
  });

  test("a skipped node says whether it lacked an input or the run had already stopped", async () => {
    const inspect = async (result: FlowRun["nodes"][number]) => {
      await mount({ ...run, nodes: [{ nodeId: "t", status: "succeeded", outputs: {} }, result] });
      const step = Array.from(container.querySelectorAll<HTMLButtonElement>("ol button")).find(
        (button) => button.textContent?.includes("Post"),
      )!;
      await act(async () => step.click());
      return container.textContent ?? "";
    };
    expect(await inspect({ nodeId: "d", status: "skipped", skipReason: "no-input" })).toContain(
      "No incoming edge fired, so this node did not run.",
    );
    expect(await inspect({ nodeId: "d", status: "skipped", skipReason: "run-stopped" })).toContain(
      "The run stopped at an earlier node, so this one did not run.",
    );
    /* A run recorded before the reason existed must not claim a missing edge either. */
    const legacy = await inspect({ nodeId: "d", status: "skipped" });
    expect(legacy).toContain("This node did not run.");
    expect(legacy).not.toContain("No incoming edge fired");
  });

  test("a run that answered its caller shows the answer under the node it inspected", async () => {
    await mount({
      ...run,
      status: "succeeded",
      nodes: [{ nodeId: "t", status: "succeeded", outputs: { run: {} } }],
      output: { price: "1800.42" },
    });
    expect(container.textContent).toContain("Answered the caller");
    expect(container.textContent).toContain("1800.42");
  });

  test("a run with no answer says nothing about one", async () => {
    await mount(run);
    expect(container.textContent).not.toContain("Answered the caller");
  });

  test("a historical result remains inspectable after its canvas node was removed", async () => {
    const snapshot = structuredClone(document);
    snapshot.nodes.push({
      id: "removed",
      type: "logic.run-code",
      position: { x: 600, y: 0 },
      label: "Removed transform",
      config: {},
    });
    await mount(
      {
        ...run,
        status: "succeeded",
        nodes: [
          { nodeId: "t", status: "succeeded", outputs: { run: {} } },
          { nodeId: "removed", status: "succeeded", outputs: { result: "historical output" } },
        ],
      },
      snapshot,
    );
    const removed = Array.from(container.querySelectorAll<HTMLButtonElement>("ol button")).find(
      (button) => button.textContent?.includes("Removed transform"),
    )!;
    await act(async () => removed.click());
    expect(removed.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector("pre")?.textContent).toContain("historical output");
  });
});
