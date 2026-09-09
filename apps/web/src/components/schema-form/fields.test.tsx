/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { Property, VariableOption } from "./schema";

// Base UI reads whether a DOM exists when it is first imported, so registration comes first.
GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { ConfigField } = await import("./fields");

const datetime: Property = { type: "string", format: "date-time", description: "When it is due." };

let container: HTMLDivElement;
let root: Root;
let changes: unknown[];

beforeEach(() => {
  changes = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(
  property: Property,
  value: unknown,
  options: { name?: string; variables?: VariableOption[] } = {},
) {
  await act(async () => {
    root.render(
      <ConfigField
        id="f"
        name={options.name ?? "due"}
        property={property}
        value={value}
        variables={options.variables}
        onChange={(next) => changes.push(next)}
      />,
    );
  });
  return document.querySelector<HTMLInputElement>("#f")!;
}

/** Picks the variable at `index` the way a reader does: open the menu, click the entry. */
async function pick(index = 0) {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[aria-label="Insert variable"]')!.click();
  });
  const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
  expect(items.length).toBeGreaterThan(index);
  await act(async () => items[index]!.click());
}

/** React may have loaded before another test registered Happy DOM, disabling input events. */
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  const key = Object.keys(input).find((name) => name.startsWith("__reactProps"))!;
  const props = (input as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  props.onChange({ target: input, currentTarget: input });
}

test("a date-time property renders a datetime control over the stored UTC instant", async () => {
  const stored = "2026-09-08T10:00:00.000Z";
  const input = await mount(datetime, stored);
  expect(input.type).toBe("datetime-local");
  expect(input.value).not.toContain("Z");
  expect(new Date(input.value).getTime()).toBe(Date.parse(stored));
  expect(container.textContent).toContain("When it is due.");
});

test("the control writes back the instant its local wall time names", async () => {
  const input = await mount(datetime, "");
  expect(input.value).toBe("");
  await act(async () => type(input, "2026-12-24T18:45"));
  expect(changes).toEqual([new Date("2026-12-24T18:45").toISOString()]);
});

test("a half-typed or cleared entry reports no value rather than an invalid one", async () => {
  const input = await mount(datetime, "2026-09-08T10:00:00.000Z");
  await act(async () => type(input, ""));
  expect(changes).toEqual([""]);
});

test("a value that is not a date reads as blank instead of breaking the control", async () => {
  expect((await mount(datetime, "not a date")).value).toBe("");
  expect((await mount(datetime, 12)).value).toBe("");
});

test("a plain string property still renders the text input it always did", async () => {
  const input = await mount({ type: "string" }, "hello");
  expect(input.type).toBe("text");
  expect(input.value).toBe("hello");
  await act(async () => type(input, "hell"));
  expect(changes).toEqual(["hell"]);
});

test("a property key names the field only when the schema offers no title", async () => {
  await mount({ type: "string" }, "");
  expect(container.textContent).toContain("Due");
  await mount({ type: "string", title: "Due date" }, "");
  expect(container.textContent).toContain("Due date");
  expect(container.textContent).not.toContain("Due<");
});

const variables: VariableOption[] = [
  { template: "{{input.value.formatted}}", source: "Balance", label: "Balance", kind: "number" },
  { template: "{{input.value}}", source: "Balance", label: "Balance details", kind: "object" },
];

test("a picked variable replaces the placeholder the field already holds", async () => {
  // The condition's Left field ships holding {{input.value}}; a pick used to append beside it.
  await mount({ type: "string" }, "{{input.value}}", { name: "left", variables });
  await pick();
  expect(changes).toEqual(["{{input.value.formatted}}"]);
});

test("a picked variable lands at the caret in mixed text", async () => {
  const input = await mount({ type: "string" }, "Balance is  today", { name: "left", variables });
  await act(async () => {
    input.focus();
    input.setSelectionRange(11, 11);
    input.dispatchEvent(new window.Event("select", { bubbles: true }));
  });
  await pick();
  expect(changes).toEqual(["Balance is {{input.value.formatted}} today"]);
});

test("a picked variable replaces the text the reader selected", async () => {
  const input = await mount({ type: "string" }, "Balance is 12 USDC", { name: "left", variables });
  await act(async () => {
    input.focus();
    input.setSelectionRange(11, 13);
    input.dispatchEvent(new window.Event("select", { bubbles: true }));
  });
  await pick();
  expect(changes).toEqual(["Balance is {{input.value.formatted}} USDC"]);
});

test("a picked variable still fills an untouched empty field", async () => {
  await mount({ type: "string" }, "", { name: "left", variables });
  await pick(1);
  expect(changes).toEqual(["{{input.value}}"]);
});

test("code is edited as multiple monospaced lines, not one line that eats newlines", async () => {
  const control = await mount({ type: "string" }, "const a = 1;", { name: "code" });
  expect(control.tagName).toBe("TEXTAREA");
  expect(control.parentElement!.className).toContain("font-mono");
  await act(async () => type(control, "const a = 1;\nreturn { sum: a + 2 };"));
  expect(changes).toEqual(["const a = 1;\nreturn { sum: a + 2 };"]);
});

test("prose fields get room while short settings stay on one line", async () => {
  expect((await mount({ type: "string" }, "", { name: "instructions" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "task" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "prompt" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "chatId" })).tagName).toBe("INPUT");
});
