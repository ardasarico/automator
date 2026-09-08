import { afterEach, beforeEach, expect, test } from "bun:test";
import { createSecretsStore } from "./secrets-store";

const originalFetch = globalThis.fetch;
const first = { name: "first_key", createdAt: "2026-09-08", updatedAt: "2026-09-08" };
const second = { name: "second_key", createdAt: "2026-09-08", updatedAt: "2026-09-08" };
let calls: string[];
let respond: () => Promise<Response>;

beforeEach(() => {
  calls = [];
  respond = async () => Response.json({ secrets: [first] });
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    return respond();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function ownedStore() {
  const store = createSecretsStore();
  store.getState().setAccount("account-a");
  return store;
}

test("changing account clears cached metadata and rotates the captured actions", async () => {
  const store = ownedStore();
  await store.getState().load("token-a");
  const old = store.getState();
  old.setAccount("account-a");
  expect(store.getState().secrets).toEqual([first]);
  expect(store.getState().load).toBe(old.load);
  old.setAccount("account-b");
  expect(store.getState()).toMatchObject({
    accountId: "account-b",
    status: "idle",
    secrets: [],
    error: null,
  });
  expect(store.getState().load).not.toBe(old.load);
  expect(store.getState().save).not.toBe(old.save);
  expect(store.getState().remove).not.toBe(old.remove);
});

test("a late list response cannot replace the next account's loaded metadata", async () => {
  const store = ownedStore();
  const response = deferred<Response>();
  respond = () => response.promise;
  const loading = store.getState().load("token-a");
  store.getState().setAccount("account-b");
  respond = async () => Response.json({ secrets: [second] });
  await store.getState().load("token-b");
  response.resolve(Response.json({ secrets: [first] }));
  await loading;
  expect(store.getState()).toMatchObject({ status: "ready", secrets: [second], error: null });
});

test("a late list failure does not put the new account in a failed state", async () => {
  const store = ownedStore();
  const response = deferred<Response>();
  respond = () => response.promise;
  const loading = store.getState().load("token-a");
  store.getState().setAccount("account-b");
  response.resolve(Response.json({ error: "unavailable" }, { status: 503 }));
  await loading;
  expect(store.getState()).toMatchObject({ status: "idle", secrets: [], error: null });
});

for (const mutation of ["save", "remove"] as const) {
  test(`a late ${mutation} response cannot mutate another account's cache`, async () => {
    const store = ownedStore();
    const response = deferred<Response>();
    respond = () => response.promise;
    const action = store
      .getState()
      [mutation]("token-a", first.name, "fake-value")
      .catch((cause: unknown) => cause);
    store.getState().setAccount("account-b");
    store.setState({ status: "ready", secrets: [first, second] });
    response.resolve(Response.json(mutation === "save" ? first : { name: first.name }));
    expect(await action).toBeInstanceOf(Error);
    expect(store.getState().secrets).toEqual([first, second]);
  });
}

for (const action of ["load", "save", "remove"] as const) {
  test(`a captured ${action} cannot start after its old token finishes refreshing`, async () => {
    const store = ownedStore();
    const captured = store.getState()[action];
    const token = deferred<string>();
    const pending = token.promise
      .then((value) => captured(value, first.name, "fake-value"))
      .catch((cause: unknown) => cause);
    store.getState().setAccount("account-b");
    token.resolve("token-a");
    await pending;
    expect(calls).toEqual([]);
    expect(store.getState()).toMatchObject({ status: "idle", secrets: [], error: null });
  });
}

test("signing out and returning to the same account still invalidates old actions", async () => {
  const store = ownedStore();
  const oldLoad = store.getState().load;
  store.getState().setAccount(null);
  store.getState().setAccount("account-a");
  await oldLoad("token-a");
  expect(calls).toEqual([]);
  expect(store.getState().secrets).toEqual([]);
});
