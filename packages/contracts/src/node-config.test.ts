import { Type } from "@sinclair/typebox";
import { describe, expect, test } from "bun:test";
import { NodeConfigError, parseNodeConfig, redactSecrets, secretFields } from "./node-config";

const schema = Type.Object({
  content: Type.String({ default: "" }),
  seconds: Type.Number({ minimum: 0, default: 1 }),
});

describe("parseNodeConfig", () => {
  test("fills defaults for an empty config", () => {
    expect(parseNodeConfig(schema, {})).toEqual({ content: "", seconds: 1 });
    expect(parseNodeConfig(schema, undefined)).toEqual({ content: "", seconds: 1 });
  });

  test("keeps provided values and drops unknown fields", () => {
    expect(parseNodeConfig(schema, { content: "hi", seconds: 3, extra: true })).toEqual({
      content: "hi",
      seconds: 3,
    });
  });

  test("does not mutate the stored config", () => {
    const config = { content: "hi" };
    parseNodeConfig(schema, config);
    expect(config).toEqual({ content: "hi" });
  });

  test("throws with the failing paths", () => {
    let caught: unknown;
    try {
      parseNodeConfig(schema, { seconds: "soon" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NodeConfigError);
    expect((caught as NodeConfigError).paths).toEqual(["/seconds"]);
  });
});

describe("secret fields", () => {
  const withSecret = Type.Object({
    webhookUrl: Type.String({ default: "", secret: true }),
    token: Type.String({ secret: true }),
    content: Type.String({ default: "" }),
  });

  test("secretFields lists the fields marked secret", () => {
    expect(secretFields(withSecret)).toEqual(["webhookUrl", "token"]);
    expect(secretFields(schema)).toEqual([]);
  });

  test("redactSecrets resets secrets to their default or drops them, keeping the rest", () => {
    const config = {
      webhookUrl: "https://discord.com/api/webhooks/1/abc",
      token: "t",
      content: "hi",
    };
    expect(redactSecrets(withSecret, config) as unknown).toEqual({ webhookUrl: "", content: "hi" });
    expect(config.webhookUrl).toBe("https://discord.com/api/webhooks/1/abc");
    expect(redactSecrets(withSecret, { content: "only" })).toEqual({ content: "only" });
    const plain = { content: "x", seconds: 2 };
    expect(redactSecrets(schema, plain)).toBe(plain);
  });
});
