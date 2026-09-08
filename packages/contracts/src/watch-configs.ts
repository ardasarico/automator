import { Type, type Static } from "@sinclair/typebox";

export const watchComparisons = ["below", "at_or_below", "above", "at_or_above"] as const;
export type WatchComparison = (typeof watchComparisons)[number];

const comparisonSchema = Type.Unsafe<WatchComparison>(
  Type.Union(watchComparisons.map((comparison) => Type.Literal(comparison))),
);

export interface PriceFeed {
  pair: string;
  address: string;
  decimals: number;
}

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

export const priceFeedPairs = [
  ...new Set(Object.values(chainlinkFeeds).flatMap((feeds) => feeds.map((feed) => feed.pair))),
  "custom",
] as const;

export function findPriceFeed(chainId: number, pair: string): PriceFeed | undefined {
  return chainlinkFeeds[chainId]?.find((feed) => feed.pair === pair);
}

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

export interface PriceTriggerPayload {
  pair: string;
  feed: string;
  price: string;
  threshold: string;
  comparison: WatchComparison;
  decimals: number;
  roundId: string;
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

export interface BalanceTriggerPayload {
  address: string;
  network: string;
  token: string;
  symbol: string;
  balance: string;
  threshold: string;
  comparison: WatchComparison;
  decimals: number;
}

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
