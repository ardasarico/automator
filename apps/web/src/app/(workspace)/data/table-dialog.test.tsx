/// <reference types="bun" />
import type { DataTable, DataTableInput } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigationModule } from "../../../auth/test-navigation";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { TableDialog } = await import("./table-dialog");

const saved: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [{ id: "email", name: "Email", type: "text", required: true }],
  recordCount: 3,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const originalFetch = globalThis.fetch;
let bodies: DataTableInput[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bodies = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as DataTableInput);
    return Response.json(saved, { status: init?.method === "POST" ? 201 : 200 });
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(table?: DataTable) {
  await act(async () => {
    root.render(<TableDialog table={table} onClose={() => {}} onSaved={() => {}} />);
  });
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

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;

/** Types `name` one character at a time, the way the column ids used to be minted. */
async function nameColumn(index: number, name: string) {
  for (let length = 1; length <= name.length; length++)
    await act(async () => type(field(`data-table-columns-${index}-name`), name.slice(0, length)));
}

async function addColumn() {
  const button = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes("Add column"),
  )!;
  await act(async () => button.click());
}

async function submit() {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>("#data-table-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

test("a new column's id is minted once, from the name the user finished typing", async () => {
  await mount();
  await act(async () => type(field("data-table-name"), "Signups"));
  await nameColumn(0, "Title");
  await addColumn();
  await nameColumn(1, "Note");
  await submit();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.columns.map((column) => ({ id: column.id, name: column.name }))).toEqual([
    { id: "title", name: "Title" },
    { id: "note", name: "Note" },
  ]);
});

test("names that slugify alike are still told apart", async () => {
  await mount();
  await act(async () => type(field("data-table-name"), "Signups"));
  await nameColumn(0, "E-mail");
  await addColumn();
  await nameColumn(1, "E mail");
  await submit();
  expect(bodies[0]!.columns.map((column) => column.id)).toEqual(["e_mail", "e_mail_2"]);
});

test("a name with nothing to slugify still gets a usable id", async () => {
  await mount();
  await act(async () => type(field("data-table-name"), "Signups"));
  await nameColumn(0, "€€€");
  await submit();
  expect(bodies[0]!.columns.map((column) => column.id)).toEqual(["column"]);
});

test("a saved column keeps its id when renamed, and a new one steps around it", async () => {
  await mount(saved);
  // The new column is named first so its id has to dedupe against a column further down the list.
  await addColumn();
  await nameColumn(1, "Email");
  await nameColumn(0, "Contact");
  await submit();
  expect(bodies[0]!.columns).toEqual([
    { id: "email", name: "Contact", type: "text", required: true },
    { id: "email_2", name: "Email", type: "text", required: false },
  ]);
});
