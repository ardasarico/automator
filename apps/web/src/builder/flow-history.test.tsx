/// <reference types="bun" />
import type {
  FlowDocument,
  FlowVersionRecord,
  ListFlowVersionsResponse,
} from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Stable like the real hook (`useCallback`), since the panel's effect depends on its identity.
const getAccessToken = async () => "privy-token";
mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => getAccessToken,
}));

const { ReactFlowProvider } = await import("@xyflow/react");
const { FlowHistory } = await import("./flow-history");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Ping",
  description: "",
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    { id: "d", type: "notify.discord", position: { x: 300, y: 0 }, label: "Post", config: {} },
  ],
  edges: [{ id: "1", source: "t", target: "d", sourceHandle: "run", targetHandle: "message" }],
};
const listing: ListFlowVersionsResponse = {
  versions: [
    { id: "ver-2", number: 2, name: "Ping", createdAt: "2026-09-07T10:01:00.000Z", nodeCount: 2 },
    { id: "ver-1", number: 1, name: "Ping", createdAt: "2026-09-07T10:00:00.000Z", nodeCount: 1 },
  ],
};
const first: FlowVersionRecord = {
  id: "ver-1",
  number: 1,
  name: "First draft",
  description: "Only the trigger.",
  document: {
    version: 1,
    id: "f",
    name: "First draft",
    description: "Only the trigger.",
    nodes: [document.nodes[0]!],
    edges: [],
  },
  createdAt: "2026-09-07T10:00:00.000Z",
};

const calls: string[] = [];
let answer: (url: string) => Response | Promise<Response> = () => Response.json(listing);
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  const nodes = useBuilderStore((state) => state.nodes);
  const dirty = useBuilderStore((state) => state.dirty);
  const name = useBuilderStore((state) => state.meta.name);
  return (
    <output data-testid="probe">
      {name}:{nodes.map((node) => node.id).join(",")}:{dirty ? "dirty" : "clean"}
    </output>
  );
}

function SaveTap() {
  const markSaved = useBuilderStore((state) => state.markSaved);
  return (
    <button type="button" data-testid="save" onClick={() => markSaved()}>
      save
    </button>
  );
}

function HistoryHarness() {
  const [visible, setVisible] = useState(true);
  const setMeta = useBuilderStore((state) => state.setMeta);
  return (
    <>
      {visible && <FlowHistory />}
      <button type="button" data-testid="edit" onClick={() => setMeta({ name: "Latest edit" })}>
        edit
      </button>
      <button type="button" data-testid="hide" onClick={() => setVisible(false)}>
        hide history
      </button>
      <Probe />
      <SaveTap />
    </>
  );
}

beforeAll(() => {
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return answer(String(url));
  }) as unknown as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});
beforeEach(() => {
  calls.length = 0;
  answer = () => Response.json(listing);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

async function mount(flow: FlowDocument = document) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={flow}>
        <ReactFlowProvider>
          <HistoryHarness />
        </ReactFlowProvider>
      </BuilderStoreProvider>,
    );
  });
  await settle();
}

const probe = () => container.querySelector('[data-testid="probe"]')!.textContent;
const click = (selector: string) =>
  act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
const listCalls = () => calls.filter((url) => url === "/api/flows/f/versions");

describe("FlowHistory", () => {
  test("lists versions newest first and marks the newest as current", async () => {
    await mount();
    expect(calls).toEqual(["/api/flows/f/versions"]);
    const rows = Array.from(container.querySelectorAll('ul[aria-label="Saved versions"] li'));
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      expect.stringMatching(/^v2Current.*2 nodes ?Restore$/),
      expect.stringMatching(/^v1.*1 node ?Restore$/),
    ]);
    expect(container.textContent).toContain("2 versions");
    expect(container.querySelectorAll("[data-slot='badge']")).toHaveLength(1);
  });

  test("restore puts the version on the canvas as an unsaved edit and says so", async () => {
    answer = (url) => (url.endsWith("/versions/1") ? Response.json(first) : Response.json(listing));
    await mount();
    expect(probe()).toBe("Ping:t,d:clean");

    await click('button[aria-label="Restore v1"]');
    await settle();
    expect(calls).toEqual(["/api/flows/f/versions", "/api/flows/f/versions/1"]);
    expect(probe()).toBe("First draft:t:dirty");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Restored v1. Save to keep it.",
    );
  });

  test("a confirmed save refetches the list and clears the restore note", async () => {
    answer = (url) => (url.endsWith("/versions/1") ? Response.json(first) : Response.json(listing));
    await mount();
    await click('button[aria-label="Restore v1"]');
    await settle();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(listCalls()).toHaveLength(1);

    await click('[data-testid="save"]');
    await settle();
    expect(listCalls()).toHaveLength(2);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(probe()).toBe("First draft:t:clean");
  });

  test("a pending restore preserves edits made while the version is loading", async () => {
    let resolveVersion: (response: Response) => void;
    answer = (url) =>
      url.endsWith("/versions/1")
        ? new Promise<Response>((resolve) => {
            resolveVersion = resolve;
          })
        : Response.json(listing);
    await mount();
    await click('button[aria-label="Restore v1"]');
    await click('[data-testid="edit"]');
    await act(async () => resolveVersion!(Response.json(first)));
    await settle();

    expect(probe()).toBe("Latest edit:t,d:dirty");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The flow changed while loading this version. Restore it again to replace the latest changes.",
    );
  });

  test("a restore that finishes after leaving History does not replace the canvas", async () => {
    let resolveVersion: (response: Response) => void;
    answer = (url) =>
      url.endsWith("/versions/1")
        ? new Promise<Response>((resolve) => {
            resolveVersion = resolve;
          })
        : Response.json(listing);
    await mount();
    await click('button[aria-label="Restore v1"]');
    await click('[data-testid="hide"]');
    await act(async () => resolveVersion!(Response.json(first)));
    await settle();

    expect(probe()).toBe("Ping:t,d:clean");
  });

  test("a failed request shows the error in place", async () => {
    answer = () => Response.json({ error: "unavailable" }, { status: 503 });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The history could not be loaded. Please try again.",
    );
  });

  test("an empty history explains how it fills", async () => {
    answer = () => Response.json({ versions: [] });
    await mount();
    expect(container.textContent).toContain("No versions yet.");
  });

  test("a flow without an id asks for a save first", async () => {
    await mount({ ...document, id: "" });
    expect(calls).toEqual([]);
    expect(container.textContent).toContain("Save the flow to start its history.");
  });
});
