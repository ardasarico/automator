/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { useColumnPreferences, forgetColumnPreferences, maxColumnWidth, minColumnWidth } =
  await import("./column-preferences");
type PreferencesState = ReturnType<typeof useColumnPreferences>;

const storageKey = "automator:data-columns:tbl-1";

let container: HTMLDivElement;
let root: Root;

/**
 * The hook as the grid holds it: the view it reads is rendered, and a change is made from an
 * event handler, which is where the grid makes its own.
 */
function Probe({ tableId, change }: { tableId: string; change?(state: PreferencesState): void }) {
  const preferences = useColumnPreferences(tableId);
  return (
    <>
      <output>{JSON.stringify({ hidden: preferences.hidden, widths: preferences.widths })}</output>
      <button type="button" onClick={() => change?.(preferences)}>
        change
      </button>
    </>
  );
}

async function mount(tableId = "tbl-1", change?: (state: PreferencesState) => void) {
  await act(async () => root.render(<Probe tableId={tableId} change={change} />));
}

function view(): { hidden: string[]; widths: Record<string, number> } {
  return JSON.parse(container.querySelector("output")!.textContent!) as {
    hidden: string[];
    widths: Record<string, number>;
  };
}

/** Applies one change through the probe's handler and answers with the view that follows. */
async function change(next: (state: PreferencesState) => void, tableId = "tbl-1") {
  await mount(tableId, next);
  await act(async () => container.querySelector("button")!.click());
  return view();
}

function stored(): unknown {
  const raw = localStorage.getItem(storageKey);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

beforeEach(() => {
  localStorage.clear();
  forgetColumnPreferences();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => GlobalRegistrator.unregister());

test("a table with no stored preferences keeps every column at its default width", async () => {
  await mount();
  expect(view()).toEqual({ hidden: [], widths: {} });
});

test("what was stored for this table comes back, and only for this table", async () => {
  localStorage.setItem(storageKey, JSON.stringify({ hidden: ["note"], widths: { email: 320 } }));
  await mount();
  expect(view()).toEqual({ hidden: ["note"], widths: { email: 320 } });

  await mount("tbl-2");
  expect(view()).toEqual({ hidden: [], widths: {} });
});

test("hiding a column is stored, and hiding it twice leaves one entry", async () => {
  expect(await change((state) => state.hide("note"))).toEqual({ hidden: ["note"], widths: {} });
  expect(stored()).toEqual({ hidden: ["note"], widths: {} });

  await act(async () => container.querySelector("button")!.click());
  expect(view().hidden).toEqual(["note"]);
});

test("a hidden column can be shown again, one at a time or all at once", async () => {
  localStorage.setItem(storageKey, JSON.stringify({ hidden: ["note", "wallet"], widths: {} }));
  expect((await change((state) => state.show("note"))).hidden).toEqual(["wallet"]);
  expect((await change((state) => state.showAll())).hidden).toEqual([]);
});

test("a width is held between the smallest and largest a column may be", async () => {
  expect((await change((state) => state.setWidth("email", 10))).widths.email).toBe(minColumnWidth);
  expect((await change((state) => state.setWidth("email", 10_000))).widths.email).toBe(
    maxColumnWidth,
  );
  expect((await change((state) => state.setWidth("email", 240.6))).widths.email).toBe(241);
  expect((await change((state) => state.clearWidth("email"))).widths).toEqual({});
});

test("a store holding something that is not JSON is ignored rather than thrown at the reader", async () => {
  localStorage.setItem(storageKey, "{not json");
  await mount();
  expect(view()).toEqual({ hidden: [], widths: {} });
});

test("entries of the wrong shape are dropped and the sound ones kept", async () => {
  localStorage.setItem(
    "automator:data-columns:tbl-2",
    JSON.stringify({ hidden: [1, "note"], widths: { a: "wide", b: 200 } }),
  );
  await mount("tbl-2");
  expect(view()).toEqual({ hidden: ["note"], widths: { b: 200 } });
});
