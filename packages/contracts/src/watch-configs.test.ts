import { describe, expect, test } from "bun:test";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import { parseNodeConfig } from "./node-config";
import {
  balanceTriggerConfigSchema,
  chainlinkFeeds,
  findPriceFeed,
  priceFeedPairs,
  priceTriggerConfigSchema,
  sampleBalancePayload,
  samplePricePayload,
  watchComparisons,
} from "./watch-configs";

describe("chainlink feed registry", () => {
  test("every address is well formed and unique within its chain", () => {
    for (const [chainId, feeds] of Object.entries(chainlinkFeeds)) {
      for (const feed of feeds) expect(feed.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(new Set(feeds.map((feed) => feed.address)).size).toBe(feeds.length);
      expect(new Set(feeds.map((feed) => feed.pair)).size).toBe(feeds.length);
      expect(Number(chainId)).toBeGreaterThan(0);
    }
  });

  test("Base Sepolia publishes the pairs the builder offers", () => {
    expect(findPriceFeed(84532, "ETH / USD")).toEqual({
      pair: "ETH / USD",
      address: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
      decimals: 8,
    });
    expect(findPriceFeed(4801, "ETH / USD")).toBeUndefined();
  });

  test("the pair list covers every published feed and ends with custom", () => {
    for (const feed of chainlinkFeeds[84532] ?? [])
      expect(priceFeedPairs).toContain(feed.pair as (typeof priceFeedPairs)[number]);
    expect(priceFeedPairs.at(-1)).toBe("custom");
  });
});

describe("watch trigger configs", () => {
  test("both triggers are in the config map the settings form reads", () => {
    expect(flowNodeConfigSchemas["trigger.price"]).toBe(priceTriggerConfigSchema);
    expect(flowNodeConfigSchemas["trigger.balance"]).toBe(balanceTriggerConfigSchema);
  });

  test("an empty price config defaults to watching ETH / USD below 4000", () => {
    const config = parseNodeConfig(priceTriggerConfigSchema, {});
    expect(config.pair).toBe("ETH / USD");
    expect(config.comparison).toBe("below");
    expect(config.threshold).toBe("4000");
    expect(config.feed).toBe("");
    expect(JSON.parse(config.samplePayload)).toEqual(samplePricePayload);
  });

  test("an empty balance config defaults to a native balance on Base below 1", () => {
    const config = parseNodeConfig(balanceTriggerConfigSchema, {});
    expect(config.network).toBe("base");
    expect(config.token).toBe("");
    expect(config.comparison).toBe("below");
    expect(config.threshold).toBe("1");
    expect(JSON.parse(config.samplePayload)).toEqual(sampleBalancePayload);
  });

  test("every comparison is accepted and anything else is rejected", () => {
    for (const comparison of watchComparisons)
      expect(parseNodeConfig(priceTriggerConfigSchema, { comparison }).comparison).toBe(comparison);
    expect(() => parseNodeConfig(priceTriggerConfigSchema, { comparison: "equals" })).toThrow();
  });

  test("an unknown pair is rejected before it reaches the poller", () => {
    expect(() => parseNodeConfig(priceTriggerConfigSchema, { pair: "DOGE / USD" })).toThrow();
    expect(parseNodeConfig(priceTriggerConfigSchema, { pair: "custom" }).pair).toBe("custom");
  });

  test("an unknown balance network is rejected", () => {
    expect(() => parseNodeConfig(balanceTriggerConfigSchema, { network: "sepolia" })).toThrow();
    expect(parseNodeConfig(balanceTriggerConfigSchema, { network: "mainnet" }).network).toBe(
      "mainnet",
    );
  });
});
