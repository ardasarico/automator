import { beforeAll, describe, expect, test } from "bun:test";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { createPrivyIdentity, type IdentityProvider } from "./privy";

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
  test("missing credentials leave auth unavailable", () => {
    expect(createPrivyIdentity(undefined, "secret")).toBeUndefined();
    expect(createPrivyIdentity("app", undefined)).toBeUndefined();
  });
});
