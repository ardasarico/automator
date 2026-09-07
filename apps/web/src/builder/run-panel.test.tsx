/// <reference types="bun" />
import type { FlowDocument, FlowRun } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { RunPanel } = await import("./run-panel");
const { AiStoreProvider, useAiStore } = await import("./ai-store-provider");
const { BuilderStoreProvider } = await import("./store-provider");
const { RunStoreProvider } = await import("./run-store-provider");

/** trigger → discord, with a webhook URL the explanation must not leak. */
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

function Probe() {
  const turns = useAiStore((state) => state.turns);
  const focusRequests = useAiStore((state) => state.focusRequests);
  return (
    <output data-testid="probe">
      {focusRequests}:{turns.map((turn) => `${turn.role}=${turn.text}`).join("|")}
    </output>
  );
}

const calls: Array<{ url: string; body: unknown }> = [];
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ kind: "message", text: "Discord refused the webhook." });
  }) as unknown as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await act(async () => root?.unmount());
  container?.remove();
  await GlobalRegistrator.unregister();
});

async function mount(initialRun: FlowRun) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <RunStoreProvider initialRun={initialRun}>
          <AiStoreProvider>
            <RunPanel />
            <Probe />
          </AiStoreProvider>
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
    const probe = container.querySelector('[data-testid="probe"]')!;
    expect(probe.textContent).toBe(
      '1:user=Explain why "Post" failed.|assistant=Discord refused the webhook.',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/ai/runs/explain");
    const body = calls[0]!.body as {
      nodeId?: string;
      document: FlowDocument;
      run: { trigger: { payload: unknown } };
    };
    expect(body.nodeId).toBe("d");
    // The document travels with its secret fields blanked and the payload redacted.
    expect(body.document.nodes[1]!.config.webhookUrl).toBe("");
    expect(body.run.trigger.payload).toEqual({ token: "[redacted]" });
    expect(JSON.stringify(body)).not.toContain("discord.com/api/webhooks");
    await act(async () => root.unmount());
    container.remove();
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
});
