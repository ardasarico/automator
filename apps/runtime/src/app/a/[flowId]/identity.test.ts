/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  describeIdKitError,
  describePrivyError,
  privyLoginMethods,
  selfieCheckAsk,
  toIdKitRequest,
  toWorldProof,
  worldAsk,
  worldPreset,
} from "./identity";

const request = {
  appId: "app_123",
  environment: "staging" as const,
  rpContext: { rp_id: "rp_1", nonce: "0x1", created_at: 1, expires_at: 301, signature: "0xs" },
};

describe("worldPreset", () => {
  test("asks for a proof of human at orb level and the legacy device credential otherwise", () => {
    expect(worldPreset({ credential: "orb", signal: "" })).toEqual({ type: "ProofOfHuman" });
    expect(worldPreset({ credential: "device", signal: "0xAda" })).toEqual({
      type: "DeviceLegacy",
      signal: "0xAda",
    });
  });

  test("asks for the legacy Selfie Check preset for a selfie-check screen", () => {
    expect(worldPreset(selfieCheckAsk({ action: "claim", signal: "" }))).toEqual({
      type: "SelfieCheckLegacy",
    });
    expect(selfieCheckAsk({ action: "claim", signal: "0xAda" })).toEqual({
      action: "claim",
      signal: "0xAda",
      credential: "selfie",
    });
    expect(worldAsk({ action: "claim", verificationLevel: "device", signal: "" })).toEqual({
      action: "claim",
      signal: "",
      credential: "device",
    });
  });
});

describe("toIdKitRequest", () => {
  test("hands IDKit the app, the signed context, the environment and the preset", () => {
    expect(toIdKitRequest({ action: "claim", credential: "orb", signal: "" }, request)).toEqual({
      app_id: "app_123",
      action: "claim",
      rp_context: request.rpContext,
      allow_legacy_proofs: true,
      environment: "staging",
      preset: { type: "ProofOfHuman" },
    });
  });

  test("refuses an app id that is not an app_ id", () => {
    expect(() =>
      toIdKitRequest(
        { action: "claim", credential: "orb", signal: "" },
        { ...request, appId: "nope" },
      ),
    ).toThrow("not an app_ id");
  });
});

describe("toWorldProof", () => {
  test("passes an IDKit result through and refuses a shape the API cannot verify", () => {
    const result = {
      protocol_version: "4.0",
      nonce: "0x1",
      action: "claim",
      environment: "staging",
      responses: [{ identifier: "proof_of_human", nullifier: "0x2", proof: ["0x1"] }],
    };
    expect(toWorldProof(result)).toBe(result);
    expect(() => toWorldProof({ protocol_version: "4.0", responses: [] })).toThrow("cannot verify");
  });
});

describe("login and error helpers", () => {
  test("passes the configured methods and leaves Privy's default for an empty pick", () => {
    expect(privyLoginMethods({ methods: ["email", "passkey"] })).toEqual(["email", "passkey"]);
    expect(privyLoginMethods({ methods: [] })).toBeUndefined();
  });

  test("describes known codes and falls back to a generic message", () => {
    expect(describeIdKitError("user_rejected")).toContain("closed the verification");
    expect(describeIdKitError("rp_signature_expired")).toContain("Reload the page");
    expect(describeIdKitError("timestamp_too_old")).toContain("Reload the page");
    expect(describeIdKitError("something_else")).toBe(
      "Verification failed (something_else). Try again.",
    );
    expect(describePrivyError("exited_auth_flow")).toContain("closed the sign-in");
    expect(describePrivyError("unknown")).toBe("Sign-in did not complete. Try again.");
  });
});
