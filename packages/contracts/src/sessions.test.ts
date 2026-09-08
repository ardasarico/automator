import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { buildPath } from "./contract";
import {
  answerMiniAppSessionContract,
  miniAppAnswerSchema,
  miniAppSessionSchema,
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

  test("builds the answer path from both params", () => {
    expect(buildPath(answerMiniAppSessionContract, { id: "f 1", sessionId: "s" })).toBe(
      "/public/flows/f%201/sessions/s/answer",
    );
  });
});
