/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { ReactFlowProvider } = await import("@xyflow/react");
const { AiPanel } = await import("./ai-panel");
const { AiStoreProvider } = await import("./ai-store-provider");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");

const webhookUrl = "https://discord.com/api/webhooks/1/abc";

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

const proposal = {
  kind: "flow",
  summary: "Changed the message.",
  verification: {
    checks: [
      { name: "Message delivery", status: "skipped", detail: "External service was not called." },
    ],
    warnings: ["Delivery remains unverified."],
  },
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
let response: unknown = proposal;
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(response);
  }) as unknown as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
  response = proposal;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
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

/* Happy DOM may initialize after React disables input events; drive the attached React props directly. */
function type(textarea: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
    textarea,
    text,
  );
  const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
  const props = (textarea as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  props.onChange({ target: textarea, currentTarget: textarea });
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

    expect(container.textContent).toContain("Automatic checks");
    expect(container.textContent).toContain("Not tested: Message delivery");
    expect(container.textContent).toContain("Delivery remains unverified.");
    await act(async () => buttonNamed("Apply changes")!.click());
    const probe = container.querySelector('[data-testid="probe"]')!;
    expect(JSON.parse(probe.textContent!)).toEqual([
      ["t", {}],
      ["d", { webhookUrl, content: "hello", username: "" }],
    ]);
  });

  test("a replacement flow does not inherit credentials from unrelated nodes with matching ids", async () => {
    await mount();
    await act(async () => {
      (container.querySelector('[role="checkbox"]') as HTMLElement).click();
    });
    expect(container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe(
      "false",
    );
    await act(async () => type(container.querySelector("textarea")!, "Create a new Discord flow"));
    await act(async () => buttonNamed("Send")!.click());

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).not.toHaveProperty("document");
    await act(async () => buttonNamed("Replace canvas")!.click());
    const probe = container.querySelector('[data-testid="probe"]')!;
    expect(JSON.parse(probe.textContent!)).toEqual([
      ["t", {}],
      ["d", { webhookUrl: "", content: "hello", username: "" }],
    ]);
  });

  test("settings and connection changes are visible before applying an otherwise unchanged flow", async () => {
    response = {
      ...proposal,
      document: {
        ...proposal.document,
        name: "Renamed flow",
        description: "Updated description",
        chainId: 4801,
        nodes: proposal.document.nodes.map((node) =>
          node.id === "d" ? { ...node, config: { ...node.config, content: "hi" } } : node,
        ),
        edges: [],
      },
    };
    await mount();
    await act(async () => type(container.querySelector("textarea")!, "Update flow settings"));
    await act(async () => buttonNamed("Send")!.click());

    const settings = container.querySelector('[aria-label="Flow settings changes"]')!;
    expect(settings.textContent).toContain("Name: Ping → Renamed flow");
    expect(settings.textContent).toContain("Description: (empty) → Updated description");
    expect(settings.textContent).toContain("Chain: Base Sepolia → World Chain Sepolia");
    const connections = container.querySelector('[aria-label="Connection changes"]')!;
    expect(connections.textContent).toContain("Remove");
    expect(connections.textContent).toContain("Run · run → Post · message");
    expect(container.querySelectorAll('[data-kind="changed"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="probe"]')?.textContent).toContain("hi");
  });

  test("composing text does not submit through the local keyboard shortcut", async () => {
    await mount();
    const textarea = container.querySelector("textarea")!;
    await act(async () => type(textarea, "A draft being composed"));
    const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
    const props = (textarea as unknown as Record<string, { onKeyDown(event: unknown): void }>)[
      key
    ]!;
    const shortcut = (isComposing: boolean) =>
      props.onKeyDown({
        key: "Enter",
        ctrlKey: true,
        currentTarget: textarea,
        target: textarea,
        nativeEvent: { isComposing },
        preventDefault() {},
      });
    await act(async () => shortcut(true));
    expect(calls).toHaveLength(0);
    expect(textarea.value).toBe("A draft being composed");
    await act(async () => shortcut(false));
    expect(calls).toHaveLength(1);
  });
});
