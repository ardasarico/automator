import { Type, type Static } from "@sinclair/typebox";

/**
 * Config schemas for the watch triggers: `trigger.price` reads a Chainlink price feed on the
 * flow's chain, `trigger.balance` reads a wallet's token balance through The Graph's Token
 * API. Both compare the reading against a threshold and start the flow when the comparison
 * turns true, so a watcher fires once per crossing rather than on every poll.
 */

/** How a watch trigger compares its reading against the threshold. */
export const watchComparisons = ["below", "at_or_below", "above", "at_or_above"] as const;
export type WatchComparison = (typeof watchComparisons)[number];

const comparisonSchema = Type.Unsafe<WatchComparison>(
  Type.Union(watchComparisons.map((comparison) => Type.Literal(comparison))),
);

/** One Chainlink aggregator: `decimals` is the feed's own, not the quoted asset's. */
export interface PriceFeed {
  pair: string;
  address: string;
  decimals: number;
}

/**
 * The Chainlink price feeds the builder offers per chain, from Chainlink's published
 * directory. World Chain Sepolia has none, so a flow on that chain needs a `feed` address of
 * its own.
 */
export const chainlinkFeeds: Record<number, readonly PriceFeed[]> = {
  84532: [
    { pair: "ETH / USD", address: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1", decimals: 8 },
    { pair: "BTC / USD", address: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298", decimals: 8 },
    { pair: "LINK / USD", address: "0xb113F5A928BCfF189C998ab20d753a47F9dE5A61", decimals: 8 },
    { pair: "USDC / USD", address: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165", decimals: 8 },
    { pair: "USDT / USD", address: "0x3ec8593F930EA45ea58c968260e6e9FF53FC934f", decimals: 8 },
    { pair: "DAI / USD", address: "0xD1092a65338d049DB68D7Be6bD89d17a0929945e", decimals: 8 },
    { pair: "CBETH / USD", address: "0x3c65e28D357a37589e1C7C86044a9f44dDC17134", decimals: 8 },
    { pair: "CBETH / ETH", address: "0x91b21900E91CD302EBeD05E45D8f270ddAED944d", decimals: 18 },
    { pair: "LINK / ETH", address: "0x56a43EB56Da12C0dc1D972ACb089c06a5dEF8e69", decimals: 18 },
  ],
};

/** The pair the trigger watches, or `custom` to read the address typed into `feed`. */
export const priceFeedPairs = [
  ...new Set(Object.values(chainlinkFeeds).flatMap((feeds) => feeds.map((feed) => feed.pair))),
  "custom",
] as const;

/** The feed for a pair on a chain, or `undefined` when the chain does not publish it. */
export function findPriceFeed(chainId: number, pair: string): PriceFeed | undefined {
  return chainlinkFeeds[chainId]?.find((feed) => feed.pair === pair);
}

/** The networks The Graph's Token API reads balances on; all are mainnets. */
export const tokenApiNetworks = ["mainnet", "base", "arbitrum-one"] as const;
export type TokenApiNetwork = (typeof tokenApiNetworks)[number];

export const samplePricePayload = {
  pair: "ETH / USD",
  feed: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
  price: "3875.42",
  threshold: "4000",
  comparison: "below",
  decimals: 8,
  roundId: "18446744073709562301",
  updatedAt: "2026-09-08T09:15:00.000Z",
  chainId: 84532,
} as const;

/** The payload a price trigger hands the flow when its comparison turns true. */
export interface PriceTriggerPayload {
  pair: string;
  feed: string;
  /** The reading in the quote unit, as a decimal string. */
  price: string;
  threshold: string;
  comparison: WatchComparison;
  decimals: number;
  roundId: string;
  /** When the feed last updated, ISO 8601. */
  updatedAt: string;
  chainId: number;
}

export const sampleBalancePayload = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  network: "base",
  token: "native",
  symbol: "ETH",
  balance: "0.42",
  threshold: "1",
  comparison: "below",
  decimals: 18,
} as const;

/** The payload a balance trigger hands the flow when its comparison turns true. */
export interface BalanceTriggerPayload {
  address: string;
  network: string;
  /** The ERC-20 contract watched, or `native` for the chain's own coin. */
  token: string;
  symbol: string;
  /** The balance in the token's own unit, as a decimal string. */
  balance: string;
  threshold: string;
  comparison: WatchComparison;
  decimals: number;
}

/**
 * The price trigger. `pair` picks one of the chain's published feeds; `custom` reads `feed`
 * instead, which is also how a chain without published feeds is watched.
 */
export const priceTriggerConfigSchema = Type.Object({
  pair: Type.Unsafe<(typeof priceFeedPairs)[number]>(
    Type.Union(
      priceFeedPairs.map((pair) => Type.Literal(pair)),
      { default: "ETH / USD", description: "The feed to watch on the flow's chain." },
    ),
  ),
  feed: Type.String({
    default: "",
    description: 'Chainlink aggregator address; used when the pair is "custom".',
  }),
  comparison: Type.Unsafe<WatchComparison>({
    ...comparisonSchema,
    default: "below",
    description: "How the price is compared against the threshold.",
  }),
  threshold: Type.String({
    default: "4000",
    description: "The price to cross, in the feed's quote unit, such as 4000 for $4,000.",
  }),
  samplePayload: Type.String({
    default: JSON.stringify(samplePricePayload, null, 2),
    description: "Payload Simulate hands to this trigger",
    contentMediaType: "application/json",
  }),
});
export type PriceTriggerConfig = Static<typeof priceTriggerConfigSchema>;

/**
 * The balance trigger. The Token API serves mainnet data, so `network` is independent of the
 * chain the flow transacts on: a flow may watch a mainnet wallet and act on a testnet.
 */
export const balanceTriggerConfigSchema = Type.Object({
  address: Type.String({ default: "", description: "The wallet whose balance is watched." }),
  network: Type.Unsafe<TokenApiNetwork>(
    Type.Union(
      tokenApiNetworks.map((network) => Type.Literal(network)),
      { default: "base", description: "The network the balance is read on." },
    ),
  ),
  token: Type.String({
    default: "",
    description: "ERC-20 contract address; blank watches the network's native coin.",
  }),
  comparison: Type.Unsafe<WatchComparison>({
    ...comparisonSchema,
    default: "below",
    description: "How the balance is compared against the threshold.",
  }),
  threshold: Type.String({
    default: "1",
    description: "The balance to cross, in the token's own unit.",
  }),
  samplePayload: Type.String({
    default: JSON.stringify(sampleBalancePayload, null, 2),
    description: "Payload Simulate hands to this trigger",
    contentMediaType: "application/json",
  }),
});
export type BalanceTriggerConfig = Static<typeof balanceTriggerConfigSchema>;

export const watchConfigSchemas = {
  "trigger.price": priceTriggerConfigSchema,
  "trigger.balance": balanceTriggerConfigSchema,
} as const;
