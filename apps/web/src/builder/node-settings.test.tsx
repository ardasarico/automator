/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { NodeSettings } = await import("./node-settings");
const { BuilderStoreProvider } = await import("./store-provider");
const { createBuilderStore } = await import("./store");
const { hydrateFlow } = await import("./document");

/** trigger → form (one field) → discord. */
const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Signup",
  description: "",
  nodes: [
    {
      id: "t",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Opened",
      config: {},
    },
    {
      id: "form",
      type: "screen.form",
      position: { x: 0, y: 0 },
      label: "Details",
      config: { fields: [{ id: "email", label: "Email", type: "email" }] },
    },
    { id: "d", type: "notify.discord", position: { x: 0, y: 0 }, label: "Announce", config: {} },
  ],
  edges: [
    { id: "1", source: "t", target: "form", sourceHandle: "visitor", targetHandle: "data" },
    { id: "2", source: "form", target: "d", sourceHandle: "submitted", targetHandle: "message" },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function mount(nodeId: string) {
  const store = createBuilderStore(document);
  const node = hydrateFlow(document).nodes.find((n) => n.id === nodeId)!;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <NodeSettings node={node} onBack={() => {}} />
      </BuilderStoreProvider>,
    );
  });
  return store;
}

beforeAll(() => {});
afterAll(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  await GlobalRegistrator.unregister();
});

describe("NodeSettings", () => {
  test("renders the array editor for form fields with schema help", async () => {
    await mount("form");
    expect(container.textContent).toContain("Submitted values travel on the Submitted port");
    expect(container.querySelector('[aria-label="Remove Field 1"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Move Field 1 up"]')).not.toBeNull();
    expect(container.textContent).toContain("Add field");
    expect(container.textContent).toContain("Key of the value in the submitted data");
    await act(async () => root.unmount());
    container.remove();
  });

  test("offers the variable picker on every string field of a node with upstream nodes", async () => {
    await mount("d");
    // webhookUrl, content and username are strings; every one gets a picker. What the menu
    // lists is listVariables' job (variables.test.ts); opening it is Base UI's.
    expect(container.querySelectorAll('[aria-label="Insert variable"]').length).toBe(3);
    await act(async () => root.unmount());
    container.remove();
  });

  test("hides the picker when nothing is upstream", async () => {
    await mount("t");
    expect(container.querySelectorAll('[aria-label="Insert variable"]').length).toBe(0);
  });
});
