import type { OnchainEventPayload } from "@automator/contracts";
import { jsonSafe } from "@automator/flow-engine";
import {
  isAddress,
  parseAbiItem,
  type AbiEvent,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

/** One decoded log as the listener sees it, before it becomes a trigger payload. */
export interface EventLog {
  address: Address;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export interface EventFilter {
  address: Address;
  event: AbiEvent;
  /** Indexed argument values to match, by name; absent matches every log of the event. */
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
}

/** What the listener needs from a chain: the head and the decoded logs of a block range. */
export interface EventReader {
  getBlockNumber(): Promise<bigint>;
  getLogs(filter: EventFilter): Promise<EventLog[]>;
}

/** Raised for a trigger config the listener cannot poll with; the message is for the log. */
export class EventConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventConfigError";
  }
}

/** `Transfer(address indexed from, ...)`, with or without a leading `event`, to its ABI item. */
export function parseEventSignature(text: string): AbiEvent {
  const trimmed = text.trim().replace(/^event\s+/, "");
  if (!trimmed) throw new EventConfigError("The trigger needs an event signature");
  let item: ReturnType<typeof parseAbiItem>;
  try {
    item = parseAbiItem(`event ${trimmed}`);
  } catch {
    throw new EventConfigError(`The event signature could not be parsed: ${trimmed}`);
  }
  if (item.type !== "event") throw new EventConfigError("The signature is not an event");
  return item;
}

export function parseEventAddress(text: string): Address {
  const trimmed = text.trim();
  if (!isAddress(trimmed))
    throw new EventConfigError(`The contract address is not valid: ${trimmed || "(blank)"}`);
  return trimmed;
}

/**
 * The `args` filter typed into the config: a JSON object whose keys name indexed inputs of
 * the event. Blank means no filter. Values pass through for viem to encode as topics.
 */
export function parseEventArgs(text: string, event: AbiEvent): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new EventConfigError("The argument filter is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new EventConfigError("The argument filter must be a JSON object");
  const indexed = new Set(
    event.inputs.filter((input) => input.indexed).map((input) => input.name ?? ""),
  );
  for (const key of Object.keys(parsed)) {
    if (!indexed.has(key))
      throw new EventConfigError(`"${key}" is not an indexed argument of ${event.name}`);
  }
  const entries = Object.entries(parsed).filter(([, value]) => value !== null && value !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** The trigger payload for one log: JSON-safe, bigints as decimal strings. */
export function eventPayload(log: EventLog, chainId: number): OnchainEventPayload {
  return {
    event: log.eventName,
    args: jsonSafe(log.args) as Record<string, unknown>,
    address: log.address,
    blockNumber: log.blockNumber.toString(),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    chainId,
  };
}

/**
 * The reader over a viem public client. `getLogs` filters by address, event topic and the
 * indexed argument values, and returns the logs decoded; a log the ABI cannot decode
 * (`strict`) is left out rather than failing the poll.
 */
export function createEventReader(client: PublicClient): EventReader {
  return {
    getBlockNumber: () => client.getBlockNumber({ cacheTime: 0 }),
    async getLogs(filter) {
      const logs = await client.getLogs({
        address: filter.address,
        event: filter.event,
        args: filter.args as never,
        fromBlock: filter.fromBlock,
        toBlock: filter.toBlock,
        strict: true,
      });
      const decoded: EventLog[] = [];
      for (const log of logs) {
        if (log.blockNumber === null || log.logIndex === null || log.transactionHash === null)
          continue;
        decoded.push({
          address: log.address,
          eventName: log.eventName,
          args: (log.args ?? {}) as Record<string, unknown>,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash as Hex,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        });
      }
      return decoded;
    },
  };
}
