import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { ScreenPreview } = await import("./screen-preview");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

test("selecting a screen previews that screen without requiring a mini-app trigger", async () => {
  const flow: FlowDocument = {
    version: 1,
    id: "preview",
    name: "Preview",
    description: "",
    nodes: [
      {
        id: "page",
        type: "screen.page",
        label: "Screen",
        config: { body: "Selected screen content" },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };
  function SelectScreen() {
    const onNodesChange = useBuilderStore((state) => state.onNodesChange);
    useEffect(
      () => onNodesChange([{ id: "page", type: "select", selected: true }]),
      [onNodesChange],
    );
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <BuilderStoreProvider document={flow}>
          <SelectScreen />
          <ScreenPreview />
        </BuilderStoreProvider>,
      );
    });
    expect(container.textContent).toContain("Previewing the selected screen");
    expect(container.textContent).toContain("Selected screen content");
    expect(container.textContent).not.toContain("Not a mini-app yet");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("external handoff survives preview panel removal and stops when the builder unmounts", async () => {
  const flow: FlowDocument = {
    version: 1,
    id: "handoff",
    name: "Unsaved preview",
    description: "",
    nodes: [
      {
        id: "page",
        type: "screen.page",
        label: "Page",
        position: { x: 0, y: 0 },
        config: { body: "Unsaved content" },
      },
    ],
    edges: [],
  };
  const deliveries: { data: unknown; origin: string }[] = [];
  const popup = {
    closed: false,
    postMessage: (data: unknown, origin: string) => deliveries.push({ data, origin }),
  };
  const originalOpen = window.open;
  let url = "";
  window.open = (target) => {
    url = String(target);
    return popup as unknown as Window;
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <BuilderStoreProvider document={flow}>
          <ScreenPreview />
        </BuilderStoreProvider>,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open in browser"]')!.click(),
    );
    const target = new URL(url);
    const nonce = new URLSearchParams(target.hash.slice(1)).get("preview");
    await act(async () =>
      root.render(
        <BuilderStoreProvider document={flow}>
          <div>AI panel</div>
        </BuilderStoreProvider>,
      ),
    );
    const ready = () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "automator.preview.ready.v1", nonce, flowId: flow.id },
          origin: target.origin,
          source: popup as unknown as Window,
        }),
      );
    ready();
    ready();
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toEqual({
      data: { type: "automator.preview.document.v1", nonce, document: flow },
      origin: target.origin,
    });
    await act(async () => root.unmount());
    ready();
    expect(deliveries).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    window.open = originalOpen;
    container.remove();
  }
});
