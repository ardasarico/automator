import { describe, expect, test } from "bun:test";
import { mcpToolName } from "./tools";

const id = "2fa12cc4-9d3e-4a1b-8c7d-000000000000";

describe("mcpToolName", () => {
  test("slugs the flow name and suffixes the first six characters of the id", () => {
    expect(mcpToolName({ id, name: "Swap USDC" })).toBe("swap_usdc_2fa12c");
  });

  test("collapses punctuation and spacing into single underscores", () => {
    expect(mcpToolName({ id, name: "  Swap USDC → ETH (fast)!  " })).toBe(
      "swap_usdc_eth_fast_2fa12c",
    );
  });

  test("keeps digits, which callers use to tell versions apart", () => {
    expect(mcpToolName({ id, name: "Rebalance v2" })).toBe("rebalance_v2_2fa12c");
  });

  test("names a flow whose title has no usable characters", () => {
    expect(mcpToolName({ id, name: "→ ←" })).toBe("flow_2fa12c");
  });

  test("names a flow with an empty title", () => {
    expect(mcpToolName({ id, name: "" })).toBe("flow_2fa12c");
  });

  test("truncates a long name without leaving a trailing underscore", () => {
    const name = "Watch the pool and rebalance the treasury whenever the ratio drifts too far";
    const toolName = mcpToolName({ id, name });
    expect(toolName.length).toBeLessThanOrEqual(64);
    expect(toolName).toBe("watch_the_pool_and_rebalance_the_treasury_whenever_the_2fa12c");
  });

  test("stays unique for two flows sharing a name", () => {
    const other = "9b0000ff-1111-2222-3333-444444444444";
    expect(mcpToolName({ id, name: "Swap" })).not.toBe(mcpToolName({ id: other, name: "Swap" }));
  });

  test("uses the whole id when it is shorter than six characters", () => {
    expect(mcpToolName({ id: "ab", name: "Swap" })).toBe("swap_ab");
  });

  test("drops characters an MCP tool name may not carry from the id", () => {
    expect(mcpToolName({ id: "a-b-c-d-e-f-g", name: "Swap" })).toBe("swap_abcdef");
  });
});
