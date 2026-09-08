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

/**
 * The watch triggers, which the scheduler polls the way it polls onchain events: this module
 * takes the reading and says whether the condition holds, the scheduler decides whether that
 * is a crossing worth a run.
 */

export const watchTriggerTypes = ["trigger.price", "trigger.balance"] as const;
export type WatchTriggerType = (typeof watchTriggerTypes)[number];

export function isWatchTrigger(node: FlowNode): boolean {
  return (watchTriggerTypes as readonly string[]).includes(node.type);
}

/** Where a watch trigger's reading comes from; each is absent until its provider is configured. */
export interface WatchSources {
  chainReaderFor?: (chainId: number) => ChainReader | undefined;
  balances?: BalanceReader;
}

export interface WatchReading {
  /** Whether the comparison holds right now. */
  met: boolean;
  /** The reading as a decimal string, stored so the log can show what changed. */
  value: string;
  /** What the flow receives if this reading turns out to be a crossing. */
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

/** One watch trigger's reading. Config problems raise `WatchConfigError`; the rest retry. */
export function readWatchTrigger(
  node: FlowNode,
  chainId: number,
  sources: WatchSources,
): Promise<WatchReading> {
  if (node.type === "trigger.price") return readPriceTrigger(node, chainId, sources);
  if (node.type === "trigger.balance") return readBalanceTrigger(node, sources);
  throw new WatchConfigError(`${node.type} is not a watch trigger`);
}
