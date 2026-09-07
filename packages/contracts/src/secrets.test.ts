import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { isSecretName, secretReferences, secretTemplate, secretValueInputSchema } from "./secrets";

describe("secret names", () => {
  test("accept lowercase identifiers only", () => {
    expect(isSecretName("discord_webhook")).toBe(true);
    expect(isSecretName("k9")).toBe(true);
    expect(isSecretName("Discord")).toBe(false);
    expect(isSecretName("9lives")).toBe(false);
    expect(isSecretName("")).toBe(false);
    expect(isSecretName("a".repeat(65))).toBe(false);
  });

  test("values must be non-empty and bounded", () => {
    expect(Value.Check(secretValueInputSchema, { value: "x" })).toBe(true);
    expect(Value.Check(secretValueInputSchema, { value: "" })).toBe(false);
    expect(Value.Check(secretValueInputSchema, { value: "x", extra: 1 })).toBe(false);
  });
});

describe("secretReferences", () => {
  test("finds every distinct secret placeholder in a config, nested arrays included", () => {
    const config = {
      webhookUrl: "{{secrets.discord}}",
      content: "Key {{ secrets.api_key }} again {{secrets.discord}}",
      fields: [{ sample: "{{secrets.token}}" }, { sample: "{{input.value}}" }],
      count: 3,
    };
    expect(secretReferences(config)).toEqual(["discord", "api_key", "token"]);
    expect(secretReferences({})).toEqual([]);
    expect(secretReferences("{{secrets.Bad}}")).toEqual([]);
  });

  test("secretTemplate round-trips through secretReferences", () => {
    expect(secretReferences({ value: secretTemplate("openai") })).toEqual(["openai"]);
  });
});
