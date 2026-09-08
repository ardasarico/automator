import {
  findPriceFeed,
  parseNodeConfig,
  priceTriggerConfigSchema,
  type PriceTriggerPayload,
} from "@automator/contracts";
import type { ChainReader } from "@automator/flow-engine";
import { isAddress, type Address } from "viem";
import { WatchConfigError, formatDecimal, validateDecimals, type Reading } from "./threshold";

export const aggregatorAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export interface PriceReading extends Reading {
  roundId: bigint;
  updatedAt: bigint;
}

export function resolveFeed(
  config: { pair: string; feed: string },
  chainId: number,
): { address: Address; decimals?: number } {
  if (config.pair !== "custom") {
    const known = findPriceFeed(chainId, config.pair);
    if (known) return { address: known.address as Address, decimals: known.decimals };
    const typed = config.feed.trim();
    if (!typed)
      throw new WatchConfigError(
        `No ${config.pair} feed is published on chain ${chainId}; set the pair to "custom" and give a feed address`,
      );
  }
  const address = config.feed.trim();
  if (!isAddress(address))
    throw new WatchConfigError(`The feed address is not valid: ${address || "(blank)"}`);
  return { address };
}

export async function readPrice(
  reader: ChainReader,
  address: Address,
  knownDecimals?: number,
): Promise<PriceReading> {
  const round = (await reader.readContract({
    address,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
    args: [],
  })) as readonly [bigint, bigint, bigint, bigint, bigint];
  const decimals =
    knownDecimals ??
    Number(
      (await reader.readContract({
        address,
        abi: aggregatorAbi,
        functionName: "decimals",
        args: [],
      })) as number | bigint,
    );
  const [roundId, answer, , updatedAt] = round;
  validateDecimals(decimals);
  if (answer <= BigInt(0)) throw new WatchConfigError(`The feed at ${address} has no answer yet`);
  if (updatedAt <= BigInt(0))
    throw new WatchConfigError(`The feed at ${address} has no completed update yet`);
  return { raw: answer, decimals, roundId, updatedAt };
}

export function pricePayload(
  config: { pair: string; comparison: PriceTriggerPayload["comparison"]; threshold: string },
  address: Address,
  reading: PriceReading,
  chainId: number,
): PriceTriggerPayload {
  return {
    pair: config.pair,
    feed: address,
    price: formatDecimal(reading),
    threshold: config.threshold.trim(),
    comparison: config.comparison,
    decimals: reading.decimals,
    roundId: reading.roundId.toString(),
    updatedAt: new Date(Number(reading.updatedAt) * 1000).toISOString(),
    chainId,
  };
}

export function parsePriceConfig(config: unknown) {
  return parseNodeConfig(priceTriggerConfigSchema, config);
}
