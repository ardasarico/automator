import { describe, expect, test } from "bun:test";
import { parseAuthResponse, sessionContract, Type, type AuthUser } from "@automator/contracts";
import { UsernameTakenError, type UserStore } from "@automator/db";
import { Elysia } from "elysia";
import { createApp } from "../app";
import { createAuthGuard } from "./guard";
import type { IdentityProvider } from "./privy";

function fixture(
  overrides: Partial<UserStore> = {},
  providerOverrides: Partial<IdentityProvider> = {},
) {
  const records = new Map<string, AuthUser>();
  const users: UserStore = {
    find: async (id) => records.get(id) ?? null,
    sync: async (id, walletAddress) => {
      const existing = records.get(id);
      const user = {
        id,
        name: null,
        username: null,
        ...existing,
        walletAddress: walletAddress ?? existing?.walletAddress ?? null,
      };
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
  const app = createApp({ database: { check: async () => "up" }, users, identity });
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
  const raw = (path: string, method: string, token: string, body: string) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      }),
    );
  return { request, raw, records, users, identity };
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

  test("a user who already has a wallet is not looked up at Privy again", async () => {
    let lookups = 0;
    const { request, records } = fixture(
      {},
      {
        walletAddress: async () => {
          lookups += 1;
          return "0xabc";
        },
      },
    );
    await request("/auth/session", "POST", "alice");
    await request("/auth/session", "POST", "alice");
    expect(lookups).toBe(1);
    expect(records.get("did:privy:alice")).toMatchObject({ walletAddress: "0xabc" });
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
    const { request, records } = fixture();
    await request("/auth/session", "POST", "alice");
    const response = await request("/auth/profile", "PUT", "alice", body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_profile" });
    expect(records.get("did:privy:alice")).toMatchObject({ name: null, username: null });
  });

  test("a name carrying a hidden formatting character is rejected", async () => {
    const { request } = fixture();
    await request("/auth/session", "POST", "alice");
    const rightToLeftOverride = String.fromCharCode(0x202e);
    const response = await request("/auth/profile", "PUT", "alice", {
      name: `Ali${rightToLeftOverride}ce`,
      username: "alice",
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_profile" });
  });

  test("a body that is not JSON at all is a generic bad request", async () => {
    const { raw } = fixture();
    const response = await raw("/auth/profile", "PUT", "alice", "{ not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  test("stores the name in composed form", async () => {
    const { request, records } = fixture();
    await request("/auth/session", "POST", "alice");
    // "e" plus a combining acute accent must be stored as the single character.
    await request("/auth/profile", "PUT", "alice", { name: "Zoé", username: "alice" });
    expect(records.get("did:privy:alice")?.name).toBe("Zoé");
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
    expect(await response.text()).toBe('{"error":"unavailable"}');
  });

  test.each(["runs", "create", "health", "www", "null", "undefined", "privy", "system"])(
    "reserves the route-colliding username %s",
    async (username) => {
      const { request } = fixture();
      await request("/auth/session", "POST", "alice");
      const response = await request("/auth/profile", "PUT", "alice", {
        name: "Alice",
        username,
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "username_reserved" });
    },
  );

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

  test("a stored row is trimmed to the response contract", async () => {
    const leaking = {
      id: "did:privy:alice",
      name: null,
      username: null,
      walletAddress: null,
      privyAppSecret: "must not leak",
    };
    const { request } = fixture({ find: async () => leaking as AuthUser });
    const response = await request("/auth/me", "GET", "alice");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: "did:privy:alice", name: null, username: null, walletAddress: null },
    });
  });
});

describe("reusable auth guard", () => {
  const sibling = (identity: IdentityProvider | undefined) =>
    new Elysia({ name: "flows" })
      .use(createAuthGuard(identity))
      .get("/flows/mine", ({ claims }) => ({ owner: claims.id }), {
        response: {
          200: Type.Object({ owner: Type.String() }),
          401: Type.Object({ error: Type.Literal("unauthorized") }),
          503: Type.Object({ error: Type.Literal("unavailable") }),
        },
      });

  const call = (identity: IdentityProvider | undefined, token?: string) =>
    createApp({ database: { check: async () => "up" } })
      .use(sibling(identity))
      .handle(
        new Request("http://localhost/flows/mine", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      );

  const identity: IdentityProvider = {
    verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 1 } : null),
    walletAddress: async () => null,
  };

  test("hands verified claims to a plugin that is not the auth plugin", async () => {
    const response = await call(identity, "alice");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ owner: "did:privy:alice" });
  });

  test.each([undefined, "forged"])("answers 401 for token %s", async (token) => {
    const response = await call(identity, token);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("still guards a sibling when the auth plugin mounts it too", async () => {
    const users: UserStore = {
      find: async (id) => ({ id, name: null, username: null, walletAddress: null }),
      sync: async (id) => ({ id, name: null, username: null, walletAddress: null }),
      saveProfile: async (id) => ({ id, name: null, username: null, walletAddress: null }),
    };
    const app = createApp({ database: { check: async () => "up" }, users, identity }).use(
      sibling(identity),
    );
    const call = (path: string, token?: string) =>
      app.handle(
        new Request(`http://localhost${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      );
    expect((await call("/auth/me", "alice")).status).toBe(200);
    expect(await (await call("/flows/mine", "alice")).json()).toEqual({ owner: "did:privy:alice" });
    expect((await call("/flows/mine")).status).toBe(401);
    expect((await call("/auth/me")).status).toBe(401);
  });

  test("answers 503 when no identity provider is configured", async () => {
    const response = await call(undefined, "alice");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
