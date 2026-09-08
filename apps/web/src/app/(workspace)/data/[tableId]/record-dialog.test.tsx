/// <reference types="bun" />
import type { DataRecord, DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigationModule } from "../../../../auth/test-navigation";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { RecordDialog } = await import("./record-dialog");

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [
    { id: "email", name: "Email", type: "text", required: true },
    { id: "wallet", name: "Wallet", type: "address", required: false },
    { id: "due", name: "Due", type: "datetime", required: false },
    { id: "amount", name: "Amount", type: "number", required: false },
  ],
  recordCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const stored: DataRecord = {
  id: "rec-1",
  tableId: "tbl-1",
  values: { email: "a@b.co" },
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method: string; body: unknown }>;
let saved: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  saved = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json(stored, { status: init?.method === "POST" ? 201 : 200 });
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

async function mount(record?: DataRecord) {
  await act(async () => {
    root.render(
      <RecordDialog
        table={table}
        record={record}
        onClose={() => {}}
        onSaved={() => {
          saved++;
        }}
      />,
    );
  });
}

function submit() {
  document
    .querySelector<HTMLFormElement>("#data-record-form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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

test("the dialog builds one field per column and seeds them from the record", async () => {
  await mount(stored);
  expect(document.querySelector<HTMLInputElement>("#record-email")?.value).toBe("a@b.co");
  expect(document.querySelector<HTMLInputElement>("#record-wallet")?.value).toBe("");
  expect(document.body.textContent).toContain("Wallet address in the 0x… format");
});

test("a record that fails its columns is reported instead of sent", async () => {
  await mount();
  await act(async () => submit());
  expect(calls).toEqual([]);
  expect(document.querySelector("[role=alert]")?.textContent).toBe('"Email" is required.');

  await act(async () => type(document.querySelector<HTMLInputElement>("#record-email")!, "a@b.co"));
  await act(async () => type(document.querySelector<HTMLInputElement>("#record-wallet")!, "0x123"));
  await act(async () => submit());
  expect(calls).toEqual([]);
  expect(document.querySelector("[role=alert]")?.textContent).toBe(
    '"Wallet" must be a wallet address.',
  );
});

test("a sound record is sent with its blanks dropped", async () => {
  await mount();
  await act(async () => type(document.querySelector<HTMLInputElement>("#record-email")!, "a@b.co"));
  await act(async () => submit());
  expect(calls).toEqual([
    {
      url: "/api/data/tables/tbl-1/records",
      method: "POST",
      body: { values: { email: "a@b.co" } },
    },
  ]);
  expect(saved).toBe(1);
});

test("a datetime column is edited in local time and stored as the UTC instant", async () => {
  const due = "2026-09-08T10:00:00.000Z";
  await mount({ ...stored, values: { email: "a@b.co", due } });
  const field = document.querySelector<HTMLInputElement>("#record-due")!;
  expect(field.type).toBe("datetime-local");
  expect(new Date(field.value).getTime()).toBe(Date.parse(due));
  expect(field.value).not.toContain("Z");

  await act(async () => type(field, "2026-12-24T18:45"));
  await act(async () => submit());
  expect(calls).toEqual([
    {
      url: "/api/data/tables/tbl-1/records/rec-1",
      method: "PATCH",
      body: {
        values: { email: "a@b.co", due: new Date("2026-12-24T18:45").toISOString() },
      },
    },
  ]);
});

/*
 * A number field hands back "" for anything it cannot read as a number, so the only entry that
 * reaches the record as a number the API cannot store is one that overflows to Infinity.
 */
test("a number the field cannot represent is named instead of sent", async () => {
  await mount();
  await act(async () => type(document.querySelector<HTMLInputElement>("#record-email")!, "a@b.co"));
  await act(async () => type(document.querySelector<HTMLInputElement>("#record-amount")!, "1e999"));
  await act(async () => submit());
  expect(calls).toEqual([]);
  expect(document.querySelector("[role=alert]")?.textContent).toBe('"Amount" must be a number.');
});
