import { describe, expect, test } from "bun:test";
import { flowNodeTypes } from "./flows";
import { parseNodeConfig } from "./node-config";
import { onchainConfigSchemas, onchainEventTriggerConfigSchema } from "./onchain-configs";

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

describe("onchain-event trigger config", () => {
  test("defaults to an ERC-20 Transfer with a realistic sample payload", () => {
    const config = parseNodeConfig(onchainEventTriggerConfigSchema, {});
    expect(config.address).toBe("");
    expect(config.event).toBe("Transfer(address indexed from, address indexed to, uint256 value)");
    expect(config.args).toBe("");
    const sample = JSON.parse(config.samplePayload) as Record<string, unknown>;
    expect(sample).toMatchObject({
      event: "Transfer",
      args: { value: expect.any(String) },
      chainId: 84532,
    });
    expect(Object.keys(sample).sort()).toEqual([
      "address",
      "args",
      "blockHash",
      "blockNumber",
      "chainId",
      "event",
      "logIndex",
      "transactionHash",
    ]);
    expect(onchainEventTriggerConfigSchema.properties.samplePayload.description).toBe(
      "Payload Simulate hands to this trigger",
    );
  });
});
