import { apiKeyLimit, type ApiKeySummary, type CreatedApiKey } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createApiKeyRoutes } from "./key-routes";
import { hashApiKey } from "./keys";
import { memoryApiKeyStore } from "./test-support";

const identity: IdentityProvider = {
  verify: async (token) =>
    token === "alice"
      ? { id: "did:privy:alice", expiresAt: 2e9 }
      : token === "bob"
        ? { id: "did:privy:bob", expiresAt: 2e9 }
        : null,
  walletAddress: async () => null,
};

function fixture(callsPerMinute?: number) {
  const { store, rows } = memoryApiKeyStore();
  const app = new Elysia().use(createApiKeyRoutes({ identity, keys: store, callsPerMinute }));
  const call = (method: string, path: string, body?: unknown, token = "alice") =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { call, store, rows };
}

describe("api key routes", () => {
  test("hands the key back once and stores only its hash", async () => {
    const { call, rows } = fixture();
    const created = await call("POST", "/api-keys", { name: "CI" });
    expect(created.status).toBe(201);
    const body = (await created.json()) as CreatedApiKey;
    expect(body.key.startsWith("ak_")).toBe(true);
    expect(body.prefix).toBe(body.key.slice(0, 11));

    const stored = [...rows.values()][0]!;
    expect(stored.keyHash).toBe(hashApiKey(body.key));
    expect(JSON.stringify([...rows.values()])).not.toContain(body.key.slice(11));

    const listed = await call("GET", "/api-keys");
    const keys = ((await listed.json()) as { keys: ApiKeySummary[] }).keys;
    expect(keys.map((key) => key.name)).toEqual(["CI"]);
    expect(JSON.stringify(keys)).not.toContain(body.key);
  });

  test("refuses a nameless key and an unknown field", async () => {
    const { call } = fixture();
    expect((await call("POST", "/api-keys", { name: "  " })).status).toBe(400);
    expect((await call("POST", "/api-keys", {})).status).toBe(400);
    expect((await call("POST", "/api-keys", { name: "CI", ownerId: "bob" })).status).toBe(400);
  });

  test("keeps one owner's keys away from another", async () => {
    const { call } = fixture();
    const created = (await (
      await call("POST", "/api-keys", { name: "CI" })
    ).json()) as CreatedApiKey;
    const theirs = (await (await call("GET", "/api-keys", undefined, "bob")).json()) as {
      keys: ApiKeySummary[];
    };
    expect(theirs.keys).toEqual([]);
    expect((await call("DELETE", `/api-keys/${created.id}`, undefined, "bob")).status).toBe(404);
    expect((await call("DELETE", `/api-keys/${created.id}`)).status).toBe(200);
    expect((await call("DELETE", `/api-keys/${created.id}`)).status).toBe(404);
  });

  test("needs a signed-in owner", async () => {
    const { call } = fixture();
    expect((await call("GET", "/api-keys", undefined, "nobody")).status).toBe(401);
  });

  test("stops an owner past the key limit with a conflict, not a crash", async () => {
    const { call } = fixture(apiKeyLimit + 5);
    for (let index = 0; index < apiKeyLimit; index += 1)
      expect((await call("POST", "/api-keys", { name: `Key ${index}` })).status).toBe(201);
    const refused = await call("POST", "/api-keys", { name: "One too many" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "conflict" });
  });

  test("limits how often keys can be minted", async () => {
    const { call } = fixture(1);
    expect((await call("POST", "/api-keys", { name: "CI" })).status).toBe(201);
    const limited = await call("POST", "/api-keys", { name: "Again" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await call("GET", "/api-keys")).status).toBe(200);
  });
});
