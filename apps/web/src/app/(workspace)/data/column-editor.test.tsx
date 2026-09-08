/// <reference types="bun" />
import { dataTableMaxColumns, type DataColumn } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import { renderToString } from "react-dom/server";
// A type-only import does not evaluate the module, so it stays out of the registration order above.
import type { ColumnRow } from "./column-editor";

// Base UI reads whether a DOM exists when it is first imported, and these modules are shared with
// the DOM tests in this directory; registering first keeps their portals working in any file order.
GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { ColumnEditor, newColumnRow, toColumnRows } = await import("./column-editor");

afterAll(() => GlobalRegistrator.unregister());

const email: DataColumn = { id: "email", name: "Email", type: "text", required: true };
const tier: DataColumn = {
  id: "tier",
  name: "Tier",
  type: "select",
  required: false,
  options: ["gold", "silver"],
};
const rows = toColumnRows([email, tier]);
const emailRow = rows[0]!;
const tierRow = rows[1]!;

const noop = () => {};
const nothingLocked: ReadonlySet<string> = new Set();

/** The opening tag of the control with this id, whatever order its attributes render in. */
function tagWithId(html: string, id: string): string {
  const match = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
  if (!match) throw new Error(`Missing control: ${id}`);
  return match[0];
}

function tagBefore(html: string, label: string): string {
  const tags = html.slice(0, html.indexOf(label)).match(/<button[^>]*>/g);
  if (!tags) throw new Error(`Missing button before: ${label}`);
  return tags[tags.length - 1]!;
}

test("a column that holds records keeps its type, and the editor says why", () => {
  const html = renderToString(
    <ColumnEditor id="c" columns={[emailRow]} locked={new Set(["email"])} onChange={noop} />,
  );
  expect(html).toContain("type cannot change once the table has records.");
  expect(tagWithId(html, "c-0-type")).toContain(' disabled=""');
});

test("a column added to a table with records can still pick its type", () => {
  const blank = newColumnRow();
  const html = renderToString(
    <ColumnEditor id="c" columns={[emailRow, blank]} locked={new Set(["email"])} onChange={noop} />,
  );
  expect(tagWithId(html, "c-1-type")).not.toContain(' disabled=""');
  expect(html).toContain("Column 2");
});

test("options are only asked for on a single select column", () => {
  const text = renderToString(
    <ColumnEditor id="c" columns={[emailRow]} locked={nothingLocked} onChange={noop} />,
  );
  expect(text).not.toContain("Options");
  const select = renderToString(
    <ColumnEditor id="c" columns={[tierRow]} locked={nothingLocked} onChange={noop} />,
  );
  expect(select).toContain("Options");
  expect(select).toContain("gold, silver");
});

test("a full table explains why no more columns can be added", () => {
  const columns = toColumnRows(
    Array.from({ length: dataTableMaxColumns }, (_, index) => ({
      ...email,
      id: `c${index}`,
      name: `Column ${index}`,
    })),
  );
  const html = renderToString(
    <ColumnEditor id="c" columns={columns} locked={nothingLocked} onChange={noop} />,
  );
  expect(html).toContain("A table can have at most");
  expect(html).toContain("Remove one to add another.");
  expect(tagBefore(html, "Add column")).toContain(' disabled=""');
});

/*
 * The rest of the file drives the editor in the DOM: a name is typed one character at a time, the
 * way the defect that remounted the row after the first keystroke was found.
 */

/** The rows the editor last reported, read after an `act` block. */
let latest: ColumnRow[] = [];

function Editor({ initial }: { initial: ColumnRow[] }) {
  const [columns, setColumns] = useState(initial);
  return (
    <ColumnEditor
      id="c"
      columns={columns}
      locked={nothingLocked}
      onChange={(next) => {
        latest = next;
        setColumns(next);
      }}
    />
  );
}

let unmount: (() => Promise<void>) | undefined;

async function mount(initial: ColumnRow[]) {
  latest = initial;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<Editor initial={initial} />));
  // Torn down in `afterEach` so a failing assertion cannot leave a second editor in the document.
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
    unmount = undefined;
  };
}

afterEach(async () => await unmount?.());

const nameInput = () => document.querySelector<HTMLInputElement>("#c-0-name")!;

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

async function typeWord(word: string) {
  for (let length = 1; length <= word.length; length++)
    await act(async () => type(nameInput(), word.slice(0, length)));
}

test("naming a new column keeps the caret in the input and mints no id yet", async () => {
  await mount([newColumnRow()]);
  await act(async () => nameInput().focus());
  await typeWord("Title");
  expect(nameInput().value).toBe("Title");
  expect(document.activeElement).toBe(nameInput());
  expect(latest.map((column) => column.id)).toEqual([""]);
});

test("renaming a saved column keeps the id its records are stored under", async () => {
  await mount(toColumnRows([email]));
  await act(async () => nameInput().focus());
  await typeWord("Contact");
  expect(latest).toEqual([{ ...emailRow, name: "Contact" }]);
  expect(document.activeElement).toBe(nameInput());
});

test("every added row gets a key of its own, whatever the columns are named", () => {
  const first = newColumnRow();
  const second = newColumnRow();
  expect(first.key).not.toBe(second.key);
  expect(toColumnRows([email])[0]!.key).not.toBe(first.key);
});
