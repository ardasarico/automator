import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import {
  identityScreenPorts,
  isIdentityScreenType,
  privyLoginConfigSchema,
  samplePrivyUser,
  sampleWorldVerification,
  visitorUserSchema,
  worldIdVerifyConfigSchema,
  worldProofSchema,
  worldRequestSchema,
} from "./identity";
import { parseScreenConfig } from "./screens";

describe("identity screen types", () => {
  test("are the two visitor pauses that need a provider", () => {
    expect(isIdentityScreenType("privy.login")).toBe(true);
    expect(isIdentityScreenType("world.id-verify")).toBe(true);
    expect(isIdentityScreenType("screen.page")).toBe(false);
    expect(identityScreenPorts["privy.login"]).toEqual({ primary: "user" });
    expect(identityScreenPorts["world.id-verify"]).toEqual({
      primary: "verified",
      secondary: "rejected",
    });
  });
});

describe("privy.login config", () => {
  test("defaults to the common login methods and a sample visitor", () => {
    expect(parseScreenConfig("privy.login", {})).toEqual({
      title: "",
      message: "",
      button: "Sign in",
      methods: ["email", "wallet", "google"],
      simulate: {
        userId: "did:privy:sample-visitor",
        email: "visitor@example.com",
        wallet: "0x0000000000000000000000000000000000000001",
        loginMethod: "email",
      },
    });
  });

  test("keeps chosen methods and fills a partial sample", () => {
    const config = parseScreenConfig("privy.login", {
      methods: ["passkey"],
      simulate: { email: "ada@example.com" },
    });
    expect(config.methods).toEqual(["passkey"]);
    expect(config.simulate.email).toBe("ada@example.com");
    expect(config.simulate.userId).toBe("did:privy:sample-visitor");
  });

  test("samples the visitor the flow sees in Simulate and the preview", () => {
    const config = Value.Default(privyLoginConfigSchema, {}) as never;
    const user = samplePrivyUser(parseScreenConfig("privy.login", config));
    expect(Value.Check(visitorUserSchema, user)).toBe(true);
    expect(user).toEqual({
      userId: "did:privy:sample-visitor",
      email: "visitor@example.com",
      wallet: "0x0000000000000000000000000000000000000001",
      loginMethod: "email",
    });
  });
});

describe("world.id-verify config", () => {
  test("defaults to a device-level check with no action yet", () => {
    expect(parseScreenConfig("world.id-verify", {})).toEqual({
      title: "",
      message: "",
      button: "Verify with World ID",
      action: "",
      verificationLevel: "device",
      signal: "",
      simulate: "verified",
    });
    expect(
      parseScreenConfig("world.id-verify", { verificationLevel: "orb" }).verificationLevel,
    ).toBe("orb");
    expect(
      parseScreenConfig("world.id-verify", { verificationLevel: "face" }).verificationLevel,
    ).toBe("device");
  });

  test("samples a verification that names the action and level", () => {
    expect(
      sampleWorldVerification(
        parseScreenConfig("world.id-verify", { action: "claim", verificationLevel: "orb" }),
      ),
    ).toEqual({
      nullifierHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      verificationLevel: "orb",
      action: "claim",
    });
  });

  test("a proof is an IDKit result: version, nonce and at least one credential response", () => {
    const proof = {
      protocol_version: "4.0",
      nonce: "0xabc",
      action: "claim",
      environment: "staging",
      responses: [{ identifier: "proof_of_human", nullifier: "0x2", proof: ["0x1"] }],
      integrity_bundle: { version: 1 },
    };
    expect(Value.Check(worldProofSchema, proof)).toBe(true);
    expect(Value.Check(worldProofSchema, { ...proof, responses: [] })).toBe(false);
    expect(Value.Check(worldProofSchema, { ...proof, nonce: undefined })).toBe(false);
    expect(
      Value.Check(worldRequestSchema, {
        appId: "app_1",
        environment: "staging",
        rpContext: { rp_id: "rp_1", nonce: "0x1", created_at: 1, expires_at: 2, signature: "0x" },
      }),
    ).toBe(true);
    expect(
      Value.Check(worldRequestSchema, { appId: "app_1", environment: "test", rpContext: {} }),
    ).toBe(false);
  });

  test("the config schemas carry no secret fields", () => {
    for (const schema of [privyLoginConfigSchema, worldIdVerifyConfigSchema]) {
      for (const property of Object.values(schema.properties)) {
        expect((property as { secret?: boolean }).secret).toBeUndefined();
      }
    }
  });
});
