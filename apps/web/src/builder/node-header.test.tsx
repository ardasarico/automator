/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { NodeHeader } = await import("./node-header");
const { hydrateFlow } = await import("./document");

const node = hydrateFlow({
  version: 1,
  id: "f",
  name: "Flow",
  description: "",
  nodes: [{ id: "a", type: "ai.agent", position: { x: 0, y: 0 }, label: "Helper", config: {} }],
  edges: [],
}).nodes[0]!;

let container: HTMLDivElement;
let root: Root;
let calls: string[];

beforeEach(() => {
  calls = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(issues = 0, readOnly = false) {
  await act(async () => {
    root.render(
      <NodeHeader
        node={node}
        issues={issues}
        readOnly={readOnly}
        onBack={() => calls.push("back")}
        onRename={(label) => calls.push(`rename:${label}`)}
        onDuplicate={() => calls.push("duplicate")}
        onSavePreset={() => calls.push("preset")}
        onDelete={() => calls.push("delete")}
      />,
    );
  });
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
    input,
    value,
  );
  const key = Object.keys(input).find((name) => name.startsWith("__reactProps"))!;
  const props = (input as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  props.onChange({ target: input, currentTarget: input });
}

function press(element: Element, key: string) {
  const reactKey = Object.keys(element).find((name) => name.startsWith("__reactProps"))!;
  const props = (element as unknown as Record<string, { onKeyDown(event: unknown): void }>)[
    reactKey
  ]!;
  props.onKeyDown({ key, target: element, currentTarget: element, preventDefault() {} });
}

test("names the node with its category and renames it in place", async () => {
  await mount();
  expect(container.textContent).toContain("AI · AI agent");
  const name = container.querySelector<HTMLButtonElement>("[aria-describedby]")!;
  expect(name.textContent).toContain("Helper");
  await act(async () => name.click());
  const input = container.querySelector<HTMLInputElement>('[aria-label="Node name"]')!;
  expect(input.value).toBe("Helper");
  await act(async () => type(input, "Concierge"));
  await act(async () => press(input, "Enter"));
  expect(calls).toEqual(["rename:Concierge"]);
  expect(container.querySelector('[aria-label="Node name"]')).toBeNull();
});

test("Escape restores the name without renaming", async () => {
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-describedby]")!.click());
  const input = container.querySelector<HTMLInputElement>('[aria-label="Node name"]')!;
  await act(async () => type(input, "Nope"));
  await act(async () => press(input, "Escape"));
  expect(calls).toEqual([]);
  expect(container.textContent).toContain("Helper");
});

test("counts the problems that block the node and hides the badge at zero", async () => {
  await mount(0);
  expect(container.textContent).not.toContain("issue");
  await mount(2);
  expect(container.textContent).toContain("2 issues");
  await mount(1);
  expect(container.textContent).toContain("1 issue");
});

test("the actions menu duplicates, saves and deletes", async () => {
  await mount();
  const open = async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Node actions"]')!.click();
    });
    return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  };
  let items = await open();
  expect(items.map((item) => item.textContent)).toEqual([
    "Duplicate",
    "Save as reusable node",
    "Delete",
  ]);
  await act(async () => items[0]!.click());
  items = await open();
  await act(async () => items[2]!.click());
  expect(calls).toEqual(["duplicate", "delete"]);
});

test("read-only shows the name as text and offers no menu", async () => {
  await mount(0, true);
  expect(container.textContent).toContain("Helper");
  expect(container.querySelector('[aria-label="Node name"]')).toBeNull();
  expect(container.querySelector("[aria-describedby]")).toBeNull();
  expect(container.querySelector('[aria-label="Node actions"]')).toBeNull();
});
