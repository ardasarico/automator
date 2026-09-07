import { describe, expect, test } from "bun:test";
import type { SecretSummary } from "@automator/contracts";
import type { SecretStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createSecretsCrypto, generateSecretsKey, parseSecretsKey } from "./crypto";
import { createSecretsResolver } from "./resolver";
import { createSecretRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) =>
    token === "alice"
      ? { id: "did:privy:alice", expiresAt: 2e9 }
      : token === "bob"
        ? { id: "did:privy:bob", expiresAt: 2e9 }
        : null,
  walletAddress: async () => null,
};

/** An in-memory store keyed by owner, holding whatever ciphertext the routes hand it. */
export function memorySecretStore() {
  const rows = new Map<string, { ciphertext: string; createdAt: string; updatedAt: string }>();
  const key = (owner: string, name: string) => `${owner} ${name}`;
  const summary = (owner: string, name: string): SecretSummary => {
    const row = rows.get(key(owner, name))!;
    return { name, createdAt: row.createdAt, updatedAt: row.updatedAt };
  };
  const store: SecretStore = {
    async list(owner) {
      return [...rows.keys()]
        .filter((k) => k.startsWith(`${owner} `))
        .map((k) => summary(owner, k.split(" ")[1]!))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async put(owner, name, ciphertext) {
      const existing = rows.get(key(owner, name));
      rows.set(key(owner, name), {
        ciphertext,
        createdAt: existing?.createdAt ?? "2026-09-07T10:00:00.000Z",
        updatedAt: "2026-09-07T10:05:00.000Z",
      });
      return summary(owner, name);
    },
    async remove(owner, name) {
      return rows.delete(key(owner, name));
    },
    async read(owner, names) {
      const found: Record<string, string> = {};
      for (const name of names) {
        const row = rows.get(key(owner, name));
        if (row) found[name] = row.ciphertext;
      }
      return found;
    },
  };
  return { store, rows };
}

function fixture(callsPerMinute?: number) {
  const crypto = createSecretsCrypto(parseSecretsKey(generateSecretsKey())!);
  const { store, rows } = memorySecretStore();
  const app = new Elysia().use(
    createSecretRoutes({ identity, secrets: store, crypto, callsPerMinute }),
  );
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
  return { call, store, rows, crypto };
}

describe("secret routes", () => {
  test("writes beyond the per-user limit answer 429; reads and deletes are not limited", async () => {
    const { call } = fixture(1);
    expect((await call("PUT", "/secrets/a", { value: "1" })).status).toBe(200);
    const limited = await call("PUT", "/secrets/b", { value: "2" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await call("PUT", "/secrets/b", { value: "2" }, "bob")).status).toBe(200);
    expect((await call("GET", "/secrets")).status).toBe(200);
    expect((await call("DELETE", "/secrets/a")).status).toBe(200);
  });

  test("stores encrypted values and lists names only", async () => {
    const { call, rows, store, crypto } = fixture();
    const put = await call("PUT", "/secrets/discord", { value: "https://discord.com/x" });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ name: "discord" });
    const stored = [...rows.values()][0]!.ciphertext;
    expect(stored).not.toContain("discord.com");
    expect(crypto.decrypt(stored)).toBe("https://discord.com/x");

    const list = await call("GET", "/secrets");
    const body = (await list.json()) as { secrets: SecretSummary[] };
    expect(body.secrets.map((s) => s.name)).toEqual(["discord"]);
    expect(JSON.stringify(body)).not.toContain("https://");

    const resolver = createSecretsResolver({ secrets: store, crypto }, "did:privy:alice");
    expect(await resolver.get(["discord", "missing"])).toEqual({
      discord: "https://discord.com/x",
    });
  });

  test("is owner-scoped and validates names and values", async () => {
    const { call } = fixture();
    await call("PUT", "/secrets/api_key", { value: "k" });
    const bobList = (await (await call("GET", "/secrets", undefined, "bob")).json()) as {
      secrets: SecretSummary[];
    };
    expect(bobList.secrets).toEqual([]);
    expect((await call("DELETE", "/secrets/api_key", undefined, "bob")).status).toBe(404);
    expect((await call("PUT", "/secrets/Bad-Name", { value: "k" })).status).toBe(400);
    expect((await call("PUT", "/secrets/ok", { value: "" })).status).toBe(400);
    expect((await call("PUT", "/secrets/ok", { nope: true })).status).toBe(400);
    expect((await call("GET", "/secrets", undefined, "stranger")).status).toBe(401);
    expect((await call("DELETE", "/secrets/api_key")).status).toBe(200);
    expect((await call("DELETE", "/secrets/api_key")).status).toBe(404);
  });
});
