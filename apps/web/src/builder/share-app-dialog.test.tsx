/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const getAccessToken = async () => "privy-token";
mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => getAccessToken,
}));

const { createRoot } = await import("react-dom/client");
const { FlowActivationProvider } = await import("./flow-activation");
const { ShareAppDialog } = await import("./share-app-dialog");
const { BuilderStoreProvider } = await import("./store-provider");

const document_: FlowDocument = {
  version: 1,
  id: "flow-id",
  name: "Ticket checkout",
  description: "",
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
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
    const patch = body as { appPublished?: boolean };
    return Response.json({
      flow: document_,
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
      appPublished: patch.appPublished ?? false,
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

async function mount(appPublished: boolean) {
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document_}>
        <FlowActivationProvider enabled={false} appPublished={appPublished} webhookToken={null}>
          <ShareAppDialog unsaved={false} onClose={() => {}} />
        </FlowActivationProvider>
      </BuilderStoreProvider>,
    );
  });
}

function button(label: string) {
  const match = Array.from(window.document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

test("publishes the app and then shows its link", async () => {
  await mount(false);
  expect(window.document.querySelector("#app-link")).toBeNull();

  await act(async () => button("Publish app").click());

  expect(bodies).toEqual([{ appPublished: true }]);
  expect(window.document.querySelector<HTMLInputElement>("#app-link")?.value).toContain(
    "/a/flow-id",
  );
});

test("unpublishes an already shared app", async () => {
  await mount(true);
  expect(window.document.querySelector<HTMLInputElement>("#app-link")?.value).toContain(
    "/a/flow-id",
  );

  await act(async () => button("Unpublish").click());

  expect(bodies).toEqual([{ appPublished: false }]);
  expect(window.document.querySelector("#app-link")).toBeNull();
});
