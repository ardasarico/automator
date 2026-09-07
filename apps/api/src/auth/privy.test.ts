import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { InvalidAuthTokenError, type PrivyClient } from "@privy-io/node";
import {
  createIdentity,
  createPrivyIdentity,
  describeVisitor,
  type IdentityProvider,
} from "./privy";

describe("Privy token verification", () => {
  let identity: IdentityProvider;
  let privateKey: CryptoKey;
  beforeAll(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    identity = createPrivyIdentity("test-app", "test-secret", await exportSPKI(pair.publicKey))!;
  });
  const token = (
    audience = "test-app",
    expiration: string | number = "1h",
    issuer = "privy.io",
    key = privateKey,
  ) =>
    new SignJWT({ sid: "test-session" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setSubject("did:privy:alice")
      .setAudience(audience)
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(key);
  test("accepts a correctly signed token for this app", async () => {
    expect(await identity.verify(await token())).toMatchObject({ id: "did:privy:alice" });
  });
  test("rejects expired tokens, other applications and other issuers", async () => {
    expect(await identity.verify(await token("other-app"))).toBeNull();
    expect(await identity.verify(await token("test-app", 1))).toBeNull();
    expect(await identity.verify(await token("test-app", "1h", "attacker"))).toBeNull();
  });
  test("rejects forged signatures and malformed tokens", async () => {
    const attacker = await generateKeyPair("ES256");
    expect(
      await identity.verify(await token("test-app", "1h", "privy.io", attacker.privateKey)),
    ).toBeNull();
    expect(await identity.verify("not-a-jwt")).toBeNull();
  });
  test("a configured key means the SDK never fetches JWKS", async () => {
    const restore = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new TypeError("Must not fetch");
    }) as unknown as typeof globalThis.fetch;
    try {
      expect(await identity.verify(await token())).toMatchObject({ id: "did:privy:alice" });
      expect(await identity.verify("not-a-jwt")).toBeNull();
    } finally {
      globalThis.fetch = restore;
    }
    expect(fetches).toBe(0);
  });

  test("missing credentials leave auth unavailable", () => {
    expect(createPrivyIdentity(undefined, "secret")).toBeUndefined();
    expect(createPrivyIdentity("app", undefined)).toBeUndefined();
  });
});

describe("verification without a local key", () => {
  /**
   * No `jwtVerificationKey`, so the SDK would fetch JWKS. `fetch` is stubbed to
   * fail, standing in for both an unreachable Privy and a key that does not match.
   */
  let identity: IdentityProvider;
  let fetches: number;
  let restore: typeof globalThis.fetch;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    privateKey = (await generateKeyPair("ES256")).privateKey;
  });

  beforeEach(() => {
    fetches = 0;
    restore = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new TypeError("JWKS endpoint unreachable");
    }) as unknown as typeof globalThis.fetch;
    identity = createPrivyIdentity("test-app", "test-secret")!;
  });

  afterEach(() => {
    globalThis.fetch = restore;
  });

  test("a malformed token is rejected, not reported as an outage", async () => {
    expect(await identity.verify("not-a-jwt")).toBeNull();
  });

  test("a well-formed token whose keys cannot be fetched is rejected", async () => {
    const forged = await new SignJWT({ sid: "test-session" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setSubject("did:privy:alice")
      .setAudience("test-app")
      .setIssuer("privy.io")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await identity.verify(forged)).toBeNull();
    // The rejection came from the JWKS path, which is exactly what a key avoids.
    expect(fetches).toBeGreaterThan(0);
  });
});

describe("visitor identity", () => {
  const accounts = [
    { type: "email", address: "ada@example.com", latest_verified_at: 100 },
    {
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "metamask",
      address: "0xExternal",
      latest_verified_at: 200,
    },
    {
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "privy",
      address: "0xEmbedded",
      latest_verified_at: 50,
    },
  ];
  const client = (user: unknown, valid = true) =>
    ({
      utils: () => ({
        auth: () => ({
          verifyAccessToken: async () => {
            if (!valid) throw new InvalidAuthTokenError("nope");
            return { user_id: "did:privy:ada", expiration: 1 };
          },
        }),
      }),
      users: () => ({ _get: async () => user }),
    }) as unknown as PrivyClient;

  test("derives the visitor from the verified token and the user's linked accounts", async () => {
    const identity = createIdentity(client({ linked_accounts: accounts }));
    expect(await identity.visitor!("token")).toEqual({
      userId: "did:privy:ada",
      wallet: "0xEmbedded",
      email: "ada@example.com",
      loginMethod: "wallet",
    });
  });

  test("rejects an invalid token before looking the user up", async () => {
    const identity = createIdentity(client({ linked_accounts: accounts }, false));
    expect(await identity.visitor!("token")).toBeNull();
  });

  test("describes a visitor with an external wallet, a Google account, a passkey, or nothing", () => {
    expect(
      describeVisitor("did:privy:x", [
        { type: "wallet", chain_type: "ethereum", wallet_client_type: "rainbow", address: "0xE" },
        { type: "google_oauth", email: "g@example.com", latest_verified_at: 9 },
      ]),
    ).toEqual({
      userId: "did:privy:x",
      wallet: "0xE",
      email: "g@example.com",
      loginMethod: "google",
    });
    expect(describeVisitor("did:privy:y", [{ type: "passkey", latest_verified_at: 1 }])).toEqual({
      userId: "did:privy:y",
      wallet: "",
      email: "",
      loginMethod: "passkey",
    });
    expect(describeVisitor("did:privy:z", [])).toEqual({
      userId: "did:privy:z",
      wallet: "",
      email: "",
      loginMethod: "",
    });
  });
});

describe("verification error mapping", () => {
  /** The SDK exposes only `verifyAccessToken`; the rest of the client is unused here. */
  const clientThatThrows = (error: unknown) =>
    ({
      utils: () => ({
        auth: () => ({
          verifyAccessToken: async () => {
            throw error;
          },
        }),
      }),
    }) as unknown as PrivyClient;

  test.each([
    ["the SDK's generic failure", "Failed to verify authentication token"],
    ["a named failure", "jwt expired"],
  ])("%s is a rejected token", async (_label, message) => {
    const identity = createIdentity(clientThatThrows(new InvalidAuthTokenError(message)));
    expect(await identity.verify("token")).toBeNull();
  });

  test("an unrelated failure is never swallowed", async () => {
    const failure = new TypeError("socket hang up");
    const identity = createIdentity(clientThatThrows(failure));
    await expect(identity.verify("token")).rejects.toBe(failure);
  });
});
