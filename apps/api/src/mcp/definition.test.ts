import { describe, expect, test } from "bun:test";
import { mcpToolDefinition } from "./tools";
import type { CallableFlow } from "./callable-flows";

const flow = (over: Partial<CallableFlow> = {}): CallableFlow => ({
  id: "2fa12cc4-9d3e-4a1b-8c7d-000000000000",
  name: "Swap USDC",
  description: "Swaps USDC for ETH on Base",
  inputs: [{ name: "amount", type: "number", required: true }],
  outputs: [{ name: "hash", type: "text" }],
  ...over,
});

describe("mcpToolDefinition", () => {
  test("names the tool after the flow", () => {
    expect(mcpToolDefinition(flow()).name).toBe("swap_usdc_2fa12c");
  });

  test("keeps the flow's own name as the title a client displays", () => {
    expect(mcpToolDefinition(flow()).title).toBe("Swap USDC");
  });

  test("describes the tool with the flow's description", () => {
    expect(mcpToolDefinition(flow()).description).toBe("Swaps USDC for ETH on Base");
  });

  test("still describes a flow whose author wrote no description", () => {
    expect(mcpToolDefinition(flow({ description: "  " })).description).toBe(
      'Runs the Automator flow "Swap USDC".',
    );
  });

  test("carries the input schema a caller must satisfy", () => {
    expect(mcpToolDefinition(flow()).inputSchema).toEqual({
      type: "object",
      properties: { amount: { type: "number" } },
      required: ["amount"],
      additionalProperties: false,
    });
  });
});
