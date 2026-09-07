import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { MiniApp } = await import("@automator/miniapp");
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

test("preview renders submitted form values and keeps live copy edits resolved", async () => {
  const flow: FlowDocument = {
    id: "preview",
    version: 1,
    name: "Tickets",
    description: "",
    nodes: [
      {
        id: "t",
        type: "trigger.miniapp-open",
        label: "Open",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "form",
        type: "screen.form",
        label: "Tickets",
        position: { x: 0, y: 0 },
        config: { fields: [{ id: "count", type: "number" }] },
      },
      {
        id: "result",
        type: "screen.page",
        label: "Result",
        position: { x: 0, y: 0 },
        config: { body: "Requested {{input.data.count}} tickets" },
      },
    ],
    edges: [
      { id: "a", source: "t", sourceHandle: "visitor", target: "form", targetHandle: "data" },
      {
        id: "b",
        source: "form",
        sourceHandle: "submitted",
        target: "result",
        targetHandle: "data",
      },
    ],
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<MiniApp document={flow} />);
    });
    const input = container.querySelector("input")!;
    input.value = "3";
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("Requested 3 tickets");
    expect(container.textContent).not.toContain("{{");
    const edited = structuredClone(flow);
    edited.nodes[2]!.config.body = "You chose {{input.data.count}}";
    await act(async () => {
      root.render(<MiniApp document={edited} />);
    });
    expect(container.textContent).toContain("You chose 3");
    expect(flow.nodes[2]!.config.body).toContain("{{input.data.count}}");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
