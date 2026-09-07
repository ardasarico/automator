import { describe, expect, test } from "bun:test";
import { e2eUser, withE2eIdentity, type IdentityProvider } from "./privy";

const real: IdentityProvider = {
  verify: async (token) => (token === "real" ? { id: "did:privy:real", expiresAt: 1 } : null),
  walletAddress: async (id) => (id === "did:privy:real" ? "0xreal" : null),
};

describe("withE2eIdentity", () => {
  test("is a no-op without a token", () => {
    expect(withE2eIdentity(real, undefined)).toBe(real);
    expect(withE2eIdentity(undefined, undefined)).toBeUndefined();
  });

  test("accepts exactly the token as the e2e user and defers everything else", async () => {
    const identity = withE2eIdentity(real, "e2e-secret")!;
    expect(await identity.verify("e2e-secret")).toEqual({
      id: e2eUser.id,
      expiresAt: 4_102_444_800,
    });
    expect(await identity.verify("real")).toEqual({ id: "did:privy:real", expiresAt: 1 });
    expect(await identity.verify("e2e-secret ")).toBeNull();
    expect(await identity.walletAddress(e2eUser.id)).toBe(e2eUser.walletAddress);
    expect(await identity.walletAddress("did:privy:real")).toBe("0xreal");
    expect(await identity.embeddedWallet!(e2eUser.id)).toMatchObject({ delegated: false });
    expect(await identity.embeddedWallet!("did:privy:real")).toBeNull();
    expect(await identity.visitor!("e2e-secret")).toEqual({
      userId: e2eUser.id,
      wallet: e2eUser.walletAddress,
      email: "e2e@example.com",
      loginMethod: "email",
    });
    expect(await identity.visitor!("real")).toBeNull();
  });

  test("works without a real provider, for an API started without Privy", async () => {
    const identity = withE2eIdentity(undefined, "e2e-secret")!;
    expect(await identity.verify("e2e-secret")).toMatchObject({ id: e2eUser.id });
    expect(await identity.verify("other")).toBeNull();
  });
});
