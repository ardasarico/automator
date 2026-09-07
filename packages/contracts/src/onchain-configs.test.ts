import { describe, expect, test } from "bun:test";
import { flowNodeTypes } from "./flows";
import { parseNodeConfig } from "./node-config";
import { onchainConfigSchemas } from "./onchain-configs";

describe("onchain config schemas", () => {
  test("name known node types and accept an empty config", () => {
    for (const [type, schema] of Object.entries(onchainConfigSchemas)) {
      expect(flowNodeTypes as readonly string[]).toContain(type);
      expect(() => parseNodeConfig(schema, {})).not.toThrow();
    }
  });

  test("write extends read with a value that defaults to zero", () => {
    expect(
      parseNodeConfig(onchainConfigSchemas["onchain.write-contract"], { functionName: "mint" }),
    ).toEqual({
      address: "",
      abi: "",
      functionName: "mint",
      args: "[]",
      value: "0",
    });
  });
});
