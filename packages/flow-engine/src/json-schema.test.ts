import { describe, expect, test } from "bun:test";
import { matchesJsonSchema } from "./json-schema";

const invoice = {
  type: "object",
  properties: {
    amount: { type: "number" },
    currency: { type: "string", enum: ["USDC", "ETH"] },
    lines: {
      type: "array",
      items: { type: "object", properties: { qty: { type: "integer" } }, required: ["qty"] },
    },
    note: { type: ["string", "null"] },
  },
  required: ["amount", "currency"],
  additionalProperties: false,
};

describe("matchesJsonSchema", () => {
  test("accepts a matching object", () => {
    expect(
      matchesJsonSchema(invoice, {
        amount: 1.5,
        currency: "USDC",
        lines: [{ qty: 2 }],
        note: null,
      }),
    ).toBe(true);
  });

  test.each([
    ["missing required", { currency: "USDC" }],
    ["wrong type", { amount: "1", currency: "USDC" }],
    ["enum miss", { amount: 1, currency: "BTC" }],
    ["bad item", { amount: 1, currency: "USDC", lines: [{ qty: 1.5 }] }],
    ["extra key", { amount: 1, currency: "USDC", extra: true }],
  ])("rejects %s", (_name, value) => {
    expect(matchesJsonSchema(invoice, value)).toBe(false);
  });

  test("ignores unknown keywords and untyped schemas", () => {
    expect(matchesJsonSchema({ format: "email" }, "x")).toBe(true);
    expect(matchesJsonSchema({ type: "string", minLength: 100 }, "x")).toBe(true);
  });
});
