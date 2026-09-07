import { describe, expect, test } from "bun:test";
import { flowNodeTypes } from "./flows";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import { parseNodeConfig } from "./node-config";

describe("flow node config schemas", () => {
  test("only name known node types", () => {
    for (const type of Object.keys(flowNodeConfigSchemas))
      expect(flowNodeTypes as readonly string[]).toContain(type);
  });

  test("every schema accepts an empty config", () => {
    for (const schema of Object.values(flowNodeConfigSchemas))
      expect(() => parseNodeConfig(schema, {})).not.toThrow();
  });

  test("condition defaults to comparing the input value", () => {
    expect(parseNodeConfig(flowNodeConfigSchemas["logic.condition"], {})).toEqual({
      left: "{{input.value}}",
      operator: "equals",
      right: "",
    });
  });

  test("wait rejects a duration above the cap", () => {
    expect(() => parseNodeConfig(flowNodeConfigSchemas["logic.wait"], { seconds: 60 })).toThrow();
  });
});
