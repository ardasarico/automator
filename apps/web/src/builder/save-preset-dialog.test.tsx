/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* One stable function: a new one each render would restart the provider's load effect. */
const getAccessToken = async () => "privy-token";
mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => getAccessToken,
}));

const { createRoot } = await import("react-dom/client");
const { NodePresetsProvider } = await import("./presets-context");
const { SavePresetDialog } = await import("./save-preset-dialog");
const { hydrateFlow } = await import("./document");

const node = hydrateFlow({
  version: 1,
  id: "f",
  name: "Flow",
  description: "",
  nodes: [
    {
      id: "d",
      type: "notify.discord",
      position: { x: 0, y: 0 },
      label: "Announce",
      config: { content: "Ready" },
    },
  ],
  edges: [],
}).nodes[0]!;

const originalFetch = globalThis.fetch;
let calls: Array<{ method: string; body?: unknown }>;
let answer: () => Response;
let closed: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  closed = 0;
  answer = () =>
    Response.json(
      {
        id: "preset-1",
        name: "Team ping",
        type: "notify.discord",
        label: "Announce",
        config: { content: "Ready" },
        createdAt: "2026-09-08T10:00:00.000Z",
        updatedAt: "2026-09-08T10:00:00.000Z",
      },
      { status: 201 },
    );
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    });
    return init?.method === "POST" ? answer() : Response.json({ presets: [] });
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(() => GlobalRegistrator.unregister());

async function mount() {
  await act(async () => {
    root.render(
      <NodePresetsProvider>
        <SavePresetDialog node={node} onClose={() => closed++} />
      </NodePresetsProvider>,
    );
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

test("saves the node's settings under its label and closes", async () => {
  await mount();
  expect(document.querySelector<HTMLInputElement>("#preset-name")?.value).toBe("Announce");

  await act(async () => button("Save node").click());

  expect(calls.filter((call) => call.method === "POST")).toEqual([
    {
      method: "POST",
      body: {
        name: "Announce",
        type: "notify.discord",
        label: "Announce",
        config: { content: "Ready" },
      },
    },
  ]);
  expect(closed).toBe(1);
});

test("a refused save keeps the dialog open with the reason", async () => {
  answer = () => Response.json({ error: "conflict" }, { status: 409 });
  await mount();

  await act(async () => button("Save node").click());

  expect(closed).toBe(0);
  expect(document.body.textContent).toContain("limit of saved nodes");
});
