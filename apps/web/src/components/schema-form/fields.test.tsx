/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { FieldProblems, Property, VariableOption } from "./schema";

// Base UI reads whether a DOM exists when it is first imported, so registration comes first.
GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { ConfigField, ObjectFields } = await import("./fields");

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

const selectItems = () => [...document.querySelectorAll<HTMLElement>("[data-slot=select-item]")];

test("a field holding one whole value lists the values by name instead of the template", async () => {
  // The condition's Compare field ships holding {{input.value}}; it used to show the raw template.
  const trigger = await mount({ type: "string" }, "{{input.value}}", { name: "left", variables });
  expect(trigger.tagName).toBe("BUTTON");
  expect(trigger.textContent).toContain("Balance details");
  expect(trigger.textContent).toContain("Change");
  expect(document.querySelector('[aria-label="Insert variable"]')).toBeNull();
  await act(async () => trigger.click());
  expect(selectItems().map((item) => item.textContent)).toEqual([
    "Balance",
    "Balance details",
    "Type your own…",
  ]);
  await act(async () => selectItems()[0]!.click());
  expect(changes).toEqual(["{{input.value.formatted}}"]);
});

test("a template the list does not know is still shown, and Type your own frees the text", async () => {
  const trigger = await mount({ type: "string" }, "{{vars.custom}}", { name: "left", variables });
  expect(trigger.textContent).toContain("{{vars.custom}}");
  await act(async () => trigger.click());
  await act(async () =>
    selectItems()
      .find((item) => item.textContent === "Type your own…")!
      .click(),
  );
  const input = document.querySelector<HTMLInputElement>("#f")!;
  expect(input.tagName).toBe("INPUT");
  expect(input.value).toBe("{{vars.custom}}");
  expect(changes).toEqual([]);
  // Text around the template keeps the field as text; a whole value picked brings the list back.
  await act(async () => type(input, "x {{vars.custom}}"));
  expect(changes).toEqual(["x {{vars.custom}}"]);
});

test("mixed text starts as text, and a whole value picked from the menu brings the list back", async () => {
  const input = await mount({ type: "string" }, "Balance is 12", { name: "left", variables });
  expect(input.tagName).toBe("INPUT");
  await act(async () => {
    input.focus();
    input.setSelectionRange(0, 13);
    input.dispatchEvent(new window.Event("select", { bubbles: true }));
  });
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

async function mountObject(
  properties: Record<string, Property>,
  value: unknown,
  options: { sectioned?: boolean; problems?: FieldProblems } = {},
) {
  await act(async () => {
    root.render(
      <ObjectFields
        id="o"
        properties={properties}
        value={value}
        onChange={(patch) => changes.push(patch)}
        sectioned={options.sectioned}
        path="config"
        problems={options.problems}
      />,
    );
  });
}

const target: Property = {
  anyOf: [{ const: "record" }, { const: "filter" }],
  title: "Find the record by",
};
const recordId: Property = {
  type: "string",
  title: "Record",
  showWhen: { field: "target", equals: "record" },
};

test("a showWhen field is hidden until its sibling matches", async () => {
  await mountObject({ target, recordId }, { target: "filter", recordId: "rec_1" });
  expect(document.querySelector("#o-recordId")).toBeNull();
  await mountObject({ target, recordId }, { target: "record", recordId: "rec_1" });
  expect(document.querySelector<HTMLInputElement>("#o-recordId")!.value).toBe("rec_1");
});

test("problems render under the field whose path they name", async () => {
  await mountObject(
    { target, recordId },
    { target: "record", recordId: "" },
    {
      problems: {
        "config.recordId": { severity: "error", message: "Name the record to change." },
        "config.missing": { severity: "warning", message: "Nowhere to show this." },
      },
    },
  );
  expect(container.textContent).toContain("Name the record to change.");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Nowhere to show this.");
  await mountObject({ target, recordId }, { target: "record", recordId: "" });
  expect(container.textContent).not.toContain("Name the record to change.");
});

test("sectioned fields put groups under a caption and advanced ones behind a summary", async () => {
  const properties: Record<string, Property> = {
    task: { type: "string" },
    tools: { type: "array", items: { anyOf: [{ const: "http_get" }] }, group: "Tools" },
    allowedHosts: {
      type: "array",
      items: { type: "string" },
      group: "Tools",
      showWhen: { field: "tools", includes: "http_get" },
    },
    maxSteps: { type: "number", advanced: true, title: "Step limit" },
  };
  await mountObject(properties, { task: "", tools: [], maxSteps: 5 }, { sectioned: true });
  const heading = container.querySelector("section h3");
  expect(heading?.textContent).toBe("Tools");
  expect(document.querySelector("#o-allowedHosts")).toBeNull();
  const details = container.querySelector("details")!;
  expect(details.querySelector("summary")!.textContent).toBe("Advanced1 setting");
  expect(details.querySelector("#o-maxSteps")).not.toBeNull();
  await mountObject(
    properties,
    { task: "", tools: ["http_get"], maxSteps: 5 },
    { sectioned: true },
  );
  expect(document.querySelector("#o-allowedHosts")).not.toBeNull();
});

test("a list of objects renders one row per item with its own controls", async () => {
  const values: Property = {
    type: "array",
    title: "Values",
    items: {
      type: "object",
      properties: { column: { type: "string" }, value: { type: "string" } },
    },
  };
  await mount(values, [
    { column: "score", value: "1" },
    { column: "name", value: "x" },
  ]);
  const rows = container.querySelectorAll('[role="group"]');
  expect(rows.length).toBe(2);
  expect(rows[0]!.getAttribute("aria-label")).toBe("Value 1");
  expect(container.querySelector("fieldset")).toBeNull();
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Remove Value 1"]')!.click();
  });
  expect(changes).toEqual([[{ column: "name", value: "x" }]]);
});

test("prose fields get room while short settings stay on one line", async () => {
  expect((await mount({ type: "string" }, "", { name: "instructions" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "task" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "prompt" })).tagName).toBe("TEXTAREA");
  expect((await mount({ type: "string" }, "", { name: "chatId" })).tagName).toBe("INPUT");
});
