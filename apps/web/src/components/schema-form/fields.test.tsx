/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { Property } from "./schema";

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

async function mount(property: Property, value: unknown) {
  await act(async () => {
    root.render(
      <ConfigField
        id="f"
        name="due"
        property={property}
        value={value}
        onChange={(next) => changes.push(next)}
      />,
    );
  });
  return document.querySelector<HTMLInputElement>("#f")!;
}

/** React may have loaded before another test registered Happy DOM, disabling input events. */
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
    input,
    value,
  );
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
