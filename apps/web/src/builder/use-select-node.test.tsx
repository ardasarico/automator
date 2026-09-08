import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { StoreApi } from "zustand";
import type { BuilderState } from "./store";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { BuilderStoreProvider, useBuilderStoreApi } = await import("./store-provider");
const { useSelectNode } = await import("./use-select-node");

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

test("choosing an outline node clears unrelated edge selection without editing the document", async () => {
  const document: FlowDocument = {
    version: 1,
    id: "flow",
    name: "Selection",
    description: "",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        position: { x: 0, y: 0 },
        label: "Start",
        config: {},
      },
      {
        id: "page",
        type: "screen.page",
        position: { x: 300, y: 0 },
        label: "Page",
        config: {},
      },
      {
        id: "other",
        type: "screen.page",
        position: { x: 600, y: 0 },
        label: "Other",
        config: {},
      },
    ],
    edges: [{ id: "unrelated", source: "trigger", target: "page" }],
  };
  let store!: StoreApi<BuilderState>;
  function OutlineChoice() {
    const api = useBuilderStoreApi();
    const selectNode = useSelectNode();
    useEffect(() => {
      store = api;
    }, [api]);
    return (
      <button type="button" onClick={() => selectNode("other")}>
        Other
      </button>
    );
  }
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <BuilderStoreProvider document={document}>
          <OutlineChoice />
        </BuilderStoreProvider>,
      );
    });
    await act(async () => {
      store.getState().onNodesChange([{ type: "select", id: "trigger", selected: true }]);
      store.getState().onEdgesChange([{ type: "select", id: "unrelated", selected: true }]);
    });
    await act(async () => container.querySelector("button")!.click());

    const state = store.getState();
    expect(state.nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(["other"]);
    expect(state.edges.filter((edge) => edge.selected)).toEqual([]);
    expect(state.edges.map((edge) => edge.id)).toEqual(["unrelated"]);
    expect(state.dirty).toBe(false);
    expect(state.past).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
