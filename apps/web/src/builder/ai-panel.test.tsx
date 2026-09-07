/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// React DOM decides at load time whether `input` events exist, so it must see the DOM first;
// with it loaded after registration a dispatched input event reaches a controlled onChange.
const { createRoot } = await import("react-dom/client");

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { ReactFlowProvider } = await import("@xyflow/react");
const { AiPanel } = await import("./ai-panel");
const { AiStoreProvider } = await import("./ai-store-provider");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");

const webhookUrl = "https://discord.com/api/webhooks/1/abc";

/** trigger → discord, with a webhook URL the model must never see. */
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
      config: { webhookUrl, content: "hi", username: "" },
    },
  ],
  edges: [{ id: "e", source: "t", target: "d", sourceHandle: "run", targetHandle: "message" }],
};

/** What the model answers: the same flow with the content changed and the secret still blank. */
const proposal = {
  kind: "flow",
  summary: "Changed the message.",
  document: {
    ...document,
    id: undefined,
    nodes: document.nodes.map((node) =>
      node.id === "d"
        ? { ...node, config: { webhookUrl: "", content: "hello", username: "" } }
        : node,
    ),
  },
};

function Probe() {
  const nodes = useBuilderStore((state) => state.nodes);
  return (
    <output data-testid="probe">
      {JSON.stringify(nodes.map((node) => [node.id, node.data.config]))}
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
    return Response.json(proposal);
  }) as unknown as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await act(async () => root?.unmount());
  container?.remove();
  await GlobalRegistrator.unregister();
});

async function mount() {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <AiStoreProvider>
          <ReactFlowProvider>
            <AiPanel />
            <Probe />
          </ReactFlowProvider>
        </AiStoreProvider>
      </BuilderStoreProvider>,
    );
  });
}

function type(textarea: HTMLTextAreaElement, text: string) {
  // React listens for the native input event and reads the value through the prototype setter.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
    textarea,
    text,
  );
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

const buttonNamed = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );

describe("AiPanel", () => {
  test("edits go to the model with secrets blanked and come back with the canvas's on Apply", async () => {
    await mount();
    const textarea = container.querySelector("textarea")!;
    await act(async () => type(textarea, "Say hello instead"));
    await act(async () => buttonNamed("Send")!.click());

    expect(calls).toHaveLength(1);
    const body = calls[0]!.body as { document: FlowDocument; prompt: string };
    expect(body.prompt).toBe("Say hello instead");
    expect(body.document.nodes[1]!.config.webhookUrl).toBe("");
    expect(JSON.stringify(body)).not.toContain("discord.com/api/webhooks");

    await act(async () => buttonNamed("Apply changes")!.click());
    const probe = container.querySelector('[data-testid="probe"]')!;
    expect(JSON.parse(probe.textContent!)).toEqual([
      ["t", {}],
      ["d", { webhookUrl, content: "hello", username: "" }],
    ]);
  });
});
