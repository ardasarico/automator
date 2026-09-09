/// <reference types="bun" />
import type { FlowDocument, FlowRun } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
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
const { AiStoreProvider, useAiStore } = await import("./ai-store-provider");
const { BuilderStoreProvider } = await import("./store-provider");
const { RunStoreProvider, useRunStore } = await import("./run-store-provider");

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

let startRun: () => void;
function Probe() {
  const start = useRunStore((state) => state.start);
  useEffect(() => {
    startRun = start;
  }, [start]);
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
  await GlobalRegistrator.unregister();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  calls.length = 0;
});

async function mount(initialRun: FlowRun, initialDocument?: FlowDocument) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <RunStoreProvider initialRun={initialRun} initialDocument={initialDocument}>
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
    expect(body.document.nodes[1]!.config.webhookUrl).toBe("");
    expect(body.run.trigger.payload).toEqual({ token: "[redacted]" });
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

  test("historical run labels and AI explanations use the executed snapshot", async () => {
    const snapshot = structuredClone(document);
    snapshot.nodes[1]!.label = "Original notification";
    snapshot.nodes[1]!.config.content = "Original content";
    await mount(run, snapshot);
    expect(container.textContent).toContain("Original notification");
    await act(async () => explainButtons()[0]!.click());
    const sent = calls.at(-1)!.body as { document: FlowDocument };
    expect(sent.document.nodes[1]!.label).toBe("Original notification");
    expect(sent.document.nodes[1]!.config.content).toBe("Original content");
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
