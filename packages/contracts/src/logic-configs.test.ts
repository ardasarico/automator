import { describe, expect, test } from "bun:test";
import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "./logic-configs";
import { NodeConfigError, parseNodeConfig } from "./node-config";

describe("logic node configs", () => {
  test("empty configs take their defaults", () => {
    expect(parseNodeConfig(switchConfigSchema, {})).toEqual({
      value: "{{input.value}}",
      cases: [],
    });
    expect(parseNodeConfig(mergeConfigSchema, {})).toEqual({ mode: "combine" });
    expect(parseNodeConfig(filterConfigSchema, {})).toEqual({
      items: "{{input.items}}",
      field: "",
      operator: "equals",
      value: "",
    });
  });

  test("keeps valid values and drops unknown fields", () => {
    expect(
      parseNodeConfig(switchConfigSchema, { value: "{{vars.tier}}", cases: ["gold"], x: 1 }),
    ).toEqual({ value: "{{vars.tier}}", cases: ["gold"] });
    expect(parseNodeConfig(mergeConfigSchema, { mode: "list" })).toEqual({ mode: "list" });
    expect(
      parseNodeConfig(filterConfigSchema, {
        field: "amount",
        operator: "greater_than",
        value: "5",
      }),
    ).toMatchObject({ field: "amount", operator: "greater_than", value: "5" });
  });

  test.each([
    [switchConfigSchema, { cases: "gold" }],
    [mergeConfigSchema, { mode: "sum" }],
    [filterConfigSchema, { operator: "matches" }],
  ])("rejects a config that does not fit %#", (schema, config) => {
    expect(() => parseNodeConfig(schema, config)).toThrow(NodeConfigError);
  });
});
