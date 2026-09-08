/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { NodeSettings } = await import("./node-settings");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");
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
    await act(async () => root.unmount());
    container.remove();
  });

  test("edits a trigger's sample payload as JSON with inline feedback", async () => {
    // Like the left panel, re-read the node from the store so an edit re-renders the form.
    // The "type" button stands in for the textarea's onChange, which writes the text as is.
    let typed = "";
    function Live() {
      const node = useBuilderStore((state) => state.nodes.find((n) => n.id === "t")!);
      const setNodeConfig = useBuilderStore((state) => state.setNodeConfig);
      return (
        <>
          <NodeSettings node={node} onBack={() => {}} />
          <button
            type="button"
            data-testid="type"
            onClick={() => setNodeConfig("t", { samplePayload: typed })}
          >
            Type
          </button>
        </>
      );
    }
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <BuilderStoreProvider document={document}>
          <Live />
        </BuilderStoreProvider>,
      );
    });
    const type = async (text: string) => {
      typed = text;
      await act(async () =>
        container.querySelector<HTMLButtonElement>("[data-testid=type]")!.click(),
      );
    };
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea#t-samplePayload");
    expect(textarea).not.toBeNull();
    // The Textarea primitive styles its wrapper; the font cascades to the control.
    expect(textarea!.parentElement!.className).toContain("font-mono");
    expect(container.textContent).toContain("Payload Simulate hands to this trigger");
    expect(container.textContent).not.toContain("Invalid JSON");

    await type('{"openedAt": ');
    expect(container.textContent).toContain("Invalid JSON");
    expect(textarea!.getAttribute("aria-invalid")).toBe("true");
    expect(textarea!.value).toBe('{"openedAt": ');
    await type('{"openedAt": "now"}');
    expect(container.textContent).not.toContain("Invalid JSON");
    expect(textarea!.getAttribute("aria-invalid")).toBeNull();
  });

  test("incomplete numeric settings stay editable and string lists follow undo", async () => {
    await act(async () => root.unmount());
    container.remove();
    const flow: FlowDocument = {
      ...document,
      nodes: [
        { id: "wait", type: "logic.wait", label: "Wait", position: { x: 0, y: 0 }, config: {} },
        {
          id: "ai",
          type: "ai.classify",
          label: "Classify",
          position: { x: 0, y: 0 },
          config: { labels: ["Original"] },
        },
      ],
      edges: [],
    };
    let change: (id: string, patch: Record<string, unknown>) => void;
    let undo: () => void;
    function Live() {
      const nodes = useBuilderStore((state) => state.nodes);
      const setNodeConfig = useBuilderStore((state) => state.setNodeConfig);
      const undoChange = useBuilderStore((state) => state.undo);
      useEffect(() => {
        change = setNodeConfig;
        undo = undoChange;
      });
      return nodes.map((node) => <NodeSettings key={node.id} node={node} onBack={() => {}} />);
    }
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <BuilderStoreProvider document={flow}>
          <Live />
        </BuilderStoreProvider>,
      );
    });
    await act(async () => change!("wait", { seconds: "" }));
    expect(container.querySelector<HTMLInputElement>("#wait-seconds")!.value).toBe("");
    expect(container.textContent).toContain("Some settings are incomplete or invalid");
    await act(async () => change!("wait", { seconds: 0.5 }));
    expect(container.querySelector<HTMLInputElement>("#wait-seconds")!.value).toBe("0.5");
    expect(container.textContent).not.toContain("Some settings are incomplete or invalid");

    await act(async () => change!("ai", { labels: ["Updated", "Other"] }));
    expect(container.querySelector<HTMLInputElement>("#ai-labels")!.value).toBe("Updated, Other");
    await act(async () => undo!());
    expect(container.querySelector<HTMLInputElement>("#ai-labels")!.value).toBe("Original");
  });
});
