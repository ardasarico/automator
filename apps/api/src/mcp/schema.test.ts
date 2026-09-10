import { describe, expect, test } from "bun:test";
import { mcpInputSchema } from "./tools";
import type { CallableFlowInput } from "./callable-flows";

const input = (over: Partial<CallableFlowInput> = {}): CallableFlowInput => ({
  name: "amount",
  type: "number",
  required: true,
  description: "",
  ...over,
});

describe("mcpInputSchema", () => {
  test("describes a flow without inputs as an object taking none", () => {
    expect(mcpInputSchema([])).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  test("maps text to a string", () => {
    expect(mcpInputSchema([input({ name: "memo", type: "text" })]).properties.memo).toEqual({
      type: "string",
    });
  });

  test("maps number to a number", () => {
    expect(mcpInputSchema([input()]).properties.amount).toEqual({ type: "number" });
  });

  test("maps boolean to a boolean", () => {
    expect(mcpInputSchema([input({ name: "dryRun", type: "boolean" })]).properties.dryRun).toEqual({
      type: "boolean",
    });
  });

  test("maps address to a string a caller cannot fill with a name", () => {
    expect(mcpInputSchema([input({ name: "to", type: "address" })]).properties.to).toEqual({
      type: "string",
      pattern: "^0x[0-9a-fA-F]{40}$",
    });
  });

  test("carries an input description through, so the model knows what to send", () => {
    expect(
      mcpInputSchema([input({ description: "How much USDC to send" })]).properties.amount,
    ).toEqual({ type: "number", description: "How much USDC to send" });
  });

  test("lists only the required inputs as required", () => {
    const schema = mcpInputSchema([
      input({ name: "amount", required: true }),
      input({ name: "memo", type: "text", required: false }),
    ]);
    expect(schema.required).toEqual(["amount"]);
  });

  test("omits the required list when nothing is required", () => {
    expect(mcpInputSchema([input({ required: false })]).required).toBeUndefined();
  });

  test("refuses unknown properties, so a typo fails instead of being ignored", () => {
    expect(mcpInputSchema([input()]).additionalProperties).toBe(false);
  });
});
