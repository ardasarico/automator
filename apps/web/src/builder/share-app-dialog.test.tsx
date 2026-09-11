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
let walletSigning: boolean | undefined = true;
mock.module("./wallet-client", () => ({
  WalletRequestError: class WalletRequestError extends Error {},
  fetchWallet: async () => ({
    address: "0x" + "a".repeat(40),
    chainId: 84532,
    chainName: "Base Sepolia",
    nativeBalance: "1",
    nativeSymbol: "ETH",
    ...(walletSigning === undefined ? {} : { signing: walletSigning }),
  }),
}));
mock.module("./enable-signing-button", () => ({
  EnableSigningButton: ({ onVerified }: { onVerified?: () => void }) => (
    <button
      type="button"
      onClick={() => {
        walletSigning = true;
        onVerified?.();
      }}
    >
      Enable server signing
    </button>
  ),
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

/* A claim that pays out: the node the signing warning has to name. */
const paying: FlowDocument = {
  ...document_,
  nodes: [
    ...document_.nodes,
    {
      id: "n2",
      type: "usdc.payout",
      position: { x: 300, y: 0 },
      label: "Send USDC",
      config: { to: "0x" + "2".repeat(40), amount: "1" },
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", sourceHandle: "visitor", targetHandle: "recipient" },
  ],
};

const originalFetch = globalThis.fetch;
let bodies: unknown[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bodies = [];
  walletSigning = true;
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

async function mount(appPublished: boolean, document = document_) {
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
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

test("unpublishing asks first, and cancelling keeps the link", async () => {
  await mount(true);
  expect(window.document.querySelector<HTMLInputElement>("#app-link")?.value).toContain(
    "/a/flow-id",
  );

  await act(async () => button("Unpublish").click());

  expect(bodies).toEqual([]);
  expect(window.document.body.textContent).toContain("The link stops working for visitors");
  expect(window.document.querySelector("#app-link")).toBeNull();
  // The button that was pressed is gone, so the question's safe answer takes its focus.
  expect(window.document.activeElement).toBe(button("Cancel"));

  await act(async () => button("Cancel").click());

  expect(bodies).toEqual([]);
  expect(window.document.querySelector<HTMLInputElement>("#app-link")?.value).toContain(
    "/a/flow-id",
  );
});

test("unpublishes an already shared app once confirmed", async () => {
  await mount(true);

  await act(async () => button("Unpublish").click());
  await act(async () => button("Unpublish").click());

  expect(bodies).toEqual([{ appPublished: false }]);
  expect(window.document.querySelector("#app-link")).toBeNull();
  expect(window.document.body.textContent).not.toContain("The link stops working for visitors");
});

test("a failed unpublish keeps the question open with its error", async () => {
  await mount(true);
  await act(async () => button("Unpublish").click());
  globalThis.fetch = (async () =>
    Response.json({ error: "unavailable" }, { status: 503 })) as unknown as typeof fetch;

  await act(async () => button("Unpublish").click());

  expect(window.document.body.textContent).toContain("The link stops working for visitors");
  expect(window.document.querySelector('[role="alert"]')?.textContent).toContain(
    "could not be saved",
  );
  expect(window.document.querySelector("#app-link")).toBeNull();

  await act(async () => button("Cancel").click());
  expect(window.document.querySelector<HTMLInputElement>("#app-link")?.value).toContain(
    "/a/flow-id",
  );
});

test("holds publishing while a paying node's server signing is off, then lets it through", async () => {
  walletSigning = false;
  await mount(false, paying);

  const warning = window.document.querySelector('[role="status"][data-signing]');
  expect(warning?.textContent).toContain("Send USDC needs server signing");
  expect(button("Publish app").disabled).toBe(true);
  expect(bodies).toEqual([]);

  await act(async () => button("Enable server signing").click());

  expect(window.document.querySelector('[role="status"][data-signing]')).toBeNull();
  expect(button("Publish app").disabled).toBe(false);
  await act(async () => button("Publish app").click());
  expect(bodies).toEqual([{ appPublished: true }]);
});

test("a server that cannot sign, or a flow that never signs, gets no warning", async () => {
  walletSigning = undefined;
  await mount(false, paying);
  expect(window.document.querySelector("[data-signing]")).toBeNull();
  expect(button("Publish app").disabled).toBe(false);

  walletSigning = false;
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount(false);
  expect(window.document.querySelector("[data-signing]")).toBeNull();
  expect(button("Publish app").disabled).toBe(false);
});

test("shows the problems the API refused with instead of a generic error", async () => {
  await mount(false, paying);
  globalThis.fetch = (async () =>
    Response.json(
      {
        error: "invalid_flow",
        problems: [
          {
            severity: "error",
            nodeId: "n2",
            message: "“Send USDC” needs server signing, which is off for your wallet.",
          },
        ],
      },
      { status: 422 },
    )) as unknown as typeof fetch;

  await act(async () => button("Publish app").click());

  const alert = window.document.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("was not published");
  expect(alert?.textContent).toContain(
    "“Send USDC” needs server signing, which is off for your wallet.",
  );
  expect(window.document.querySelector("#app-link")).toBeNull();
});
