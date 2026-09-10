/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { createRoot } = await import("react-dom/client");
const { FlowActivationProvider } = await import("./flow-activation");
const { UseAsApiDialog } = await import("./use-as-api-dialog");
const { BuilderStoreProvider } = await import("./store-provider");

const quote: FlowDocument = {
  version: 1,
  id: "flow-quote",
  name: "Price quote",
  description: "",
  nodes: [
    {
      id: "call",
      type: "trigger.api",
      position: { x: 0, y: 0 },
      label: "API call",
      config: {
        description: "Quote a swap",
        inputs: [{ name: "amount", type: "number", description: "How much", required: true }],
      },
    },
    {
      id: "out",
      type: "logic.return",
      position: { x: 300, y: 0 },
      label: "Return",
      config: { outputs: [{ name: "price", value: "{{input.value.amount}}" }] },
    },
  ],
  edges: [{ id: "e", source: "call", sourceHandle: "input", target: "out", targetHandle: "value" }],
};

const scheduled: FlowDocument = {
  ...quote,
  id: "flow-nightly",
  name: "Nightly",
  nodes: [
    { id: "t", type: "trigger.schedule", position: { x: 0, y: 0 }, label: "Every day", config: {} },
  ],
  edges: [],
};

const originalFetch = globalThis.fetch;
let bodies: unknown[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bodies = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    bodies.push(body);
    return Response.json({
      flow: quote,
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
      enabled: (body as { enabled?: boolean }).enabled ?? false,
    });
  }) as typeof fetch;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(document = quote, enabled = false) {
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <FlowActivationProvider enabled={enabled} webhookToken={null}>
          <UseAsApiDialog unsaved={false} onClose={() => {}} />
        </FlowActivationProvider>
      </BuilderStoreProvider>,
    );
  });
}

test("shows the flow's own endpoint and an example built from its inputs", async () => {
  await mount();
  const endpoint = window.document.querySelector<HTMLInputElement>("#api-endpoint");
  expect(endpoint?.value).toContain("/v1/flows/flow-quote/invoke");
  const text = window.document.body.textContent ?? "";
  expect(text).toContain("curl -X POST");
  expect(text).toContain('"amount": 1');
  expect(text).toContain("$AUTOMATOR_API_KEY");
});

test("says what the endpoint takes and what it answers with", async () => {
  await mount();
  const text = window.document.body.textContent ?? "";
  expect(text).toContain("amount as JSON");
  expect(text).toContain("answers with price");
});

test("the activation switch turns the saved flow on through the API", async () => {
  await mount();
  // The Switch renders a hidden checkbox carrying the id, beside the control the reader clicks.
  const active = window.document.querySelector<HTMLInputElement>("#api-active");
  expect(active?.checked).toBe(false);
  await act(async () => active?.click());
  expect(bodies).toEqual([{ enabled: true }]);
});

test("a flow with no API trigger says so instead of offering an endpoint", async () => {
  await mount(scheduled);
  expect(window.document.body.textContent).toContain("no API call trigger");
  expect(window.document.querySelector("#api-endpoint")).toBeNull();
});

test("points at Connections for the key, and never prints one", async () => {
  await mount();
  const text = window.document.body.textContent ?? "";
  expect(text).toContain("Connections");
  expect(text).not.toContain("ak_");
});
