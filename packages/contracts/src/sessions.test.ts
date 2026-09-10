import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { buildPath } from "./contract";
import { apiErrorSchema } from "./contract";
import { screenNodeTypes } from "./screens";
import {
  answerMiniAppSessionContract,
  miniAppAnswerSchema,
  miniAppPaymentSchema,
  miniAppSessionSchema,
  type MiniAppPayment,
  type MiniAppSession,
} from "./sessions";

describe("mini-app session contracts", () => {
  test("accepts a session on a screen and one that ended", () => {
    const onScreen: MiniAppSession = {
      sessionId: "s1",
      token: "t",
      status: "screen",
      screen: { nodeId: "n", type: "screen.form", label: "Details", config: { fields: [] } },
      steps: [{ nodeId: "d", label: "Discord", status: "succeeded" }],
    };
    expect(Value.Check(miniAppSessionSchema, onScreen)).toBe(true);
    expect(
      Value.Check(miniAppSessionSchema, {
        ...onScreen,
        screen: { nodeId: "n", type: "world.id-verify", label: "Verify", config: { action: "a" } },
      }),
    ).toBe(true);
    expect(Value.Check(miniAppSessionSchema, { sessionId: "s1", status: "end", steps: [] })).toBe(
      true,
    );
    expect(
      Value.Check(miniAppSessionSchema, {
        sessionId: "s1",
        status: "screen",
        steps: [],
        screen: { nodeId: "n", type: "logic.wait", label: "x", config: {} },
      }),
    ).toBe(false);
  });

  test("an answer carries the token, screen id and a port, optionally form values", () => {
    expect(Value.Check(miniAppAnswerSchema, { token: "t", nodeId: "n", port: "next" })).toBe(true);
    expect(
      Value.Check(miniAppAnswerSchema, {
        token: "t",
        nodeId: "n",
        port: "submitted",
        data: { email: "a" },
      }),
    ).toBe(true);
    expect(
      Value.Check(miniAppAnswerSchema, {
        token: "t",
        nodeId: "n",
        port: "user",
        privyToken: "jwt",
      }),
    ).toBe(true);
    expect(
      Value.Check(miniAppAnswerSchema, {
        token: "t",
        nodeId: "n",
        port: "verified",
        worldProof: {
          protocol_version: "3.0",
          nonce: "0x1",
          action: "claim",
          responses: [{ identifier: "orb", merkle_root: "0x1", nullifier: "0x2", proof: "0x3" }],
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(miniAppAnswerSchema, { token: "t", nodeId: "n", port: "user", privyToken: "" }),
    ).toBe(false);
    expect(Value.Check(miniAppAnswerSchema, { port: "next" })).toBe(false);
    expect(Value.Check(miniAppAnswerSchema, { token: "t", port: "next" })).toBe(false);
    expect(Value.Check(miniAppAnswerSchema, { token: "t", nodeId: "", port: "next" })).toBe(false);
    expect(
      Value.Check(miniAppAnswerSchema, { token: "t", nodeId: "n", port: "next", extra: 1 }),
    ).toBe(false);
  });

  test("names every screen type a session can pause on", () => {
    for (const type of screenNodeTypes)
      expect([
        type,
        Value.Check(miniAppSessionSchema, {
          sessionId: "s1",
          status: "screen",
          steps: [],
          screen: { nodeId: "n", type, label: "x", config: {} },
        }),
      ]).toEqual([type, true]);
  });

  test("a payment screen is served with the exact transfer the visitor has to make", () => {
    const payment: MiniAppPayment = {
      chainId: 84532,
      chainName: "Base Sepolia",
      token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      to: "0x1111111111111111111111111111111111111111",
      amount: "12.50",
      amountUnits: "12500000",
    };
    expect(Value.Check(miniAppPaymentSchema, payment)).toBe(true);
    expect(
      Value.Check(miniAppSessionSchema, {
        sessionId: "s1",
        status: "screen",
        steps: [],
        screen: { nodeId: "n", type: "usdc.payment", label: "Pay", config: {}, payment },
      }),
    ).toBe(true);
    // The units the visitor signs for are exact, never a float the browser has to re-derive.
    expect(Value.Check(miniAppPaymentSchema, { ...payment, amountUnits: 12500000 })).toBe(false);
  });

  test("an answered payment carries its transaction hash and the payer's sign-in", () => {
    expect(
      Value.Check(miniAppAnswerSchema, {
        token: "t",
        nodeId: "n",
        port: "paid",
        data: { txHash: "0xabc" },
        privyToken: "jwt",
      }),
    ).toBe(true);
  });

  test("a payment that cannot be accepted yet answers with a code of its own", () => {
    for (const error of ["payment_pending", "payment_rejected", "payment_used"])
      expect([error, Value.Check(apiErrorSchema, { error })]).toEqual([error, true]);
  });

  test("builds the answer path from both params", () => {
    expect(buildPath(answerMiniAppSessionContract, { id: "f 1", sessionId: "s" })).toBe(
      "/public/flows/f%201/sessions/s/answer",
    );
  });
});
