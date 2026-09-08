import type { OnchainEventPayload } from "@automator/contracts";
import { jsonSafe } from "@automator/flow-engine";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  isAddress,
  parseAbiItem,
  type AbiEvent,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

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
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
}

export interface EventReader {
  getBlockNumber(): Promise<bigint>;
  getLogs(filter: EventFilter): Promise<EventLog[]>;
}

export class EventConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventConfigError";
  }
}

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

/* viem compares decoded integer filters with strict equality, so use bigint values. */
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
  const indexed = new Map(
    event.inputs.filter((input) => input.indexed).map((input) => [input.name ?? "", input]),
  );
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const input = indexed.get(key);
    if (!input) throw new EventConfigError(`"${key}" is not an indexed argument of ${event.name}`);
    if (value === null || value === "") continue;
    entries.push([key, normalizeEventArg(input, value)]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeEventArg(input: AbiEvent["inputs"][number], value: unknown): unknown {
  if (!/^u?int\d*$/.test(input.type)) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeEventArg(input, item));
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new EventConfigError(`"${input.name}" must be a safe integer or an integer string`);
  if ((typeof value !== "number" && typeof value !== "string") || value === "")
    throw new EventConfigError(`"${input.name}" must be an integer`);
  try {
    if (typeof value === "string" && !value.trim()) throw new Error("Blank integer");
    const encoded = encodeAbiParameters([input], [BigInt(value)]);
    return decodeAbiParameters([input], encoded)[0];
  } catch {
    throw new EventConfigError(`"${input.name}" must be a valid ${input.type} integer`);
  }
}

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
        if (
          log.removed ||
          log.blockNumber === null ||
          log.blockHash === null ||
          log.logIndex === null ||
          log.transactionHash === null
        )
          continue;
        decoded.push({
          address: log.address,
          eventName: log.eventName,
          args: (log.args ?? {}) as Record<string, unknown>,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        });
      }
      return decoded;
    },
  };
}
