import type { BalanceTriggerPayload, FlowNode, PriceTriggerPayload } from "@automator/contracts";
import type { ChainReader } from "@automator/flow-engine";
import {
  balancePayload,
  parseBalanceConfig,
  parseWatchedAddress,
  parseWatchedToken,
  type BalanceReader,
} from "./balances";
import { parsePriceConfig, pricePayload, readPrice, resolveFeed } from "./price";
import { WatchConfigError, formatDecimal, thresholdMet } from "./threshold";

const watchTriggerTypes = ["trigger.price", "trigger.balance"] as const;

export function isWatchTrigger(node: FlowNode): boolean {
  return (watchTriggerTypes as readonly string[]).includes(node.type);
}

export interface WatchSources {
  chainReaderFor?: (chainId: number) => ChainReader | undefined;
  balances?: BalanceReader;
}

export interface WatchReading {
  met: boolean;
  value: string;
  payload: PriceTriggerPayload | BalanceTriggerPayload;
}

async function readPriceTrigger(
  node: FlowNode,
  chainId: number,
  sources: WatchSources,
): Promise<WatchReading> {
  const config = parsePriceConfig(node.config);
  const reader = sources.chainReaderFor?.(chainId);
  if (!reader) throw new WatchConfigError(`Chain ${chainId} has no reader`);
  const feed = resolveFeed(config, chainId);
  const reading = await readPrice(reader, feed.address, feed.decimals);
  return {
    met: thresholdMet(config.comparison, reading, config.threshold),
    value: formatDecimal(reading),
    payload: pricePayload(config, feed.address, reading, chainId),
  };
}

async function readBalanceTrigger(node: FlowNode, sources: WatchSources): Promise<WatchReading> {
  const config = parseBalanceConfig(node.config);
  if (!sources.balances)
    throw new WatchConfigError("The balance trigger needs a Token API key on the server");
  const address = parseWatchedAddress(config.address);
  const token = parseWatchedToken(config.token);
  const reading = await sources.balances.read({ network: config.network, address, token });
  return {
    met: thresholdMet(config.comparison, reading, config.threshold),
    value: formatDecimal(reading),
    payload: balancePayload(config, address, reading),
  };
}

export function readWatchTrigger(
  node: FlowNode,
  chainId: number,
  sources: WatchSources,
): Promise<WatchReading> {
  if (node.type === "trigger.price") return readPriceTrigger(node, chainId, sources);
  if (node.type === "trigger.balance") return readBalanceTrigger(node, sources);
  throw new WatchConfigError(`${node.type} is not a watch trigger`);
}
