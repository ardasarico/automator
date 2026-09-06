import { describe, expect, test } from "bun:test";
import { parseAuthResponse, sessionContract, type AuthUser } from "@automator/contracts";
import { UsernameTakenError, type UserStore } from "@automator/db";
import { createApp } from "../app";
import type { IdentityProvider } from "./privy";

function fixture(
  overrides: Partial<UserStore> = {},
  providerOverrides: Partial<IdentityProvider> = {},
) {
  const records = new Map<string, AuthUser>();
  const users: UserStore = {
    find: async (id) => records.get(id) ?? null,
    sync: async (id, walletAddress) => {
      const user = { id, name: null, username: null, ...records.get(id), walletAddress };
      records.set(id, user);
      return user;
    },
    saveProfile: async (id, input) => {
      if ([...records.values()].some((u) => u.id !== id && u.username === input.username))
        throw new UsernameTakenError();
      const user = { ...records.get(id)!, ...input, name: input.name.trim() };
      records.set(id, user);
      return user;
    },
    ...overrides,
  };
  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob"].includes(token)
        ? { id: `did:privy:${token}`, expiresAt: 2_000_000_000 }
        : null,
    walletAddress: async () => "0x1234567890123456789012345678901234567890",
    ...providerOverrides,
  };
  const app = createApp({ check: async () => "up" }, { users, identity });
  const request = (path: string, method = "GET", token?: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(method !== "GET" && body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { request, records };
}

describe("authenticated API boundary", () => {
  test.each([undefined, "forged", "expired"])(
    "rejects token %s before touching user storage",
    async (token) => {
      const forbidden = async (): Promise<never> => {
        throw new Error("Storage must not be called");
      };
      const { request } = fixture({ find: forbidden, sync: forbidden, saveProfile: forbidden });
      for (const [path, method, body] of [
        ["/auth/me", "GET", undefined],
        ["/auth/session", "POST", undefined],
        ["/auth/profile", "PUT", { name: "Alice", username: "alice" }],
      ] as const) {
        const response = await request(path, method, token, body);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    },
  );
  test("repeated login preserves a completed profile and isolates users", async () => {
    const { request, records } = fixture();
    const first = await request("/auth/session", "POST", "alice");
    expect(parseAuthResponse(sessionContract, await first.json()).user.id).toBe("did:privy:alice");
    expect(
      (await request("/auth/profile", "PUT", "alice", { name: " Alice ", username: "alice" }))
        .status,
    ).toBe(200);
    await request("/auth/session", "POST", "alice");
    await request("/auth/session", "POST", "bob");
    expect(records.size).toBe(2);
    const response = await request("/auth/me", "GET", "alice");
    expect(await response.json()).toMatchObject({
      user: { id: "did:privy:alice", name: "Alice", username: "alice" },
    });
    expect(await (await request("/auth/me", "GET", "bob")).json()).toMatchObject({
      user: { id: "did:privy:bob", name: null },
    });
  });
  test("concurrent username claims have one winner", async () => {
    const { request } = fixture();
    await Promise.all([
      request("/auth/session", "POST", "alice"),
      request("/auth/session", "POST", "bob"),
    ]);
    const responses = await Promise.all(
      ["alice", "bob"].map((token) =>
        request("/auth/profile", "PUT", token, { name: token, username: "shared_name" }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)!.json()).toEqual({
      error: "username_taken",
    });
  });
  test.each([
    { name: " ", username: "alice" },
    { name: "Alice", username: "Alice" },
    { name: "Alice", username: "ab" },
    { name: "Alice", username: "a".repeat(25) },
    { name: "Alice", username: "alice", id: "did:privy:bob" },
    { name: "Alice", username: "alice", walletAddress: "forged" },
  ])("rejects invalid or identity-overriding profile input %j", async (body) => {
    const { request } = fixture();
    await request("/auth/session", "POST", "alice");
    expect((await request("/auth/profile", "PUT", "alice", body)).status).toBe(422);
  });
  test("reserved names and database failures return controlled errors", async () => {
    const { request } = fixture({
      saveProfile: async () => {
        throw new Error("Database secret must not leak");
      },
    });
    await request("/auth/session", "POST", "alice");
    expect(
      await (
        await request("/auth/profile", "PUT", "alice", { name: "Alice", username: "admin" })
      ).json(),
    ).toEqual({ error: "username_reserved" });
    const response = await request("/auth/profile", "PUT", "alice", {
      name: "Alice",
      username: "alice",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
  test("upstream failure is retryable, not a false logout", async () => {
    const { request } = fixture(
      {},
      {
        verify: async () => {
          throw new Error("JWKS unavailable");
        },
      },
    );
    expect((await request("/auth/me", "GET", "alice")).status).toBe(503);
    expect((await request("/health/live")).status).toBe(200);
  });
});
