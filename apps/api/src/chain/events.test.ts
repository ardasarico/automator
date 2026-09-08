import { describe, expect, test } from "bun:test";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  numberToHex,
  pad,
  type Address,
  type Hex,
} from "viem";
import {
  createEventReader,
  eventPayload,
  parseEventAddress,
  parseEventArgs,
  parseEventSignature,
} from "./events";

const transfer = "Transfer(address indexed from, address indexed to, uint256 value)";
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const alice = "0x1111111111111111111111111111111111111111" as Address;
const bob = "0x2222222222222222222222222222222222222222" as Address;

describe("event signatures and filters", () => {
  test("parses a human-readable signature with or without the event keyword", () => {
    const event = parseEventSignature(transfer);
    expect(event.name).toBe("Transfer");
    expect(event.inputs.map((input) => input.indexed ?? false)).toEqual([true, true, false]);
    expect(parseEventSignature(`event ${transfer}`).name).toBe("Transfer");
  });

  test.each(["", "Transfer(", "function foo()"])("rejects %j", (text) => {
    expect(() => parseEventSignature(text)).toThrow();
  });

  test("checks the contract address", () => {
    expect(parseEventAddress(` ${usdc} `)).toBe(usdc);
    expect(() => parseEventAddress("")).toThrow("not valid");
    expect(() => parseEventAddress("0x123")).toThrow("not valid");
  });

  test("reads the argument filter against the indexed inputs", () => {
    const event = parseEventSignature(transfer);
    expect(parseEventArgs("", event)).toBeUndefined();
    expect(parseEventArgs("  ", event)).toBeUndefined();
    expect(parseEventArgs(`{"to": "${bob}"}`, event)).toEqual({ to: bob });
    expect(parseEventArgs(`{"to": [ "${bob}", "${alice}" ]}`, event)).toEqual({ to: [bob, alice] });
    expect(parseEventArgs(`{"to": ""}`, event)).toBeUndefined();
    expect(() => parseEventArgs(`{"value": "1"}`, event)).toThrow("not an indexed argument");
    expect(() => parseEventArgs("[1]", event)).toThrow("JSON object");
    expect(() => parseEventArgs("{nope", event)).toThrow("not valid JSON");
  });

  test("normalizes integer filters to the types viem decodes, including OR filters", () => {
    const event = parseEventSignature("Ticket(uint256 indexed id, int8 indexed tier)");
    expect(parseEventArgs('{"id":"9007199254740993","tier":"-1"}', event)).toEqual({
      id: BigInt("9007199254740993"),
      tier: -1,
    });
    expect(parseEventArgs('{"id":[42,"43"],"tier":[1,"2"]}', event)).toEqual({
      id: [BigInt(42), BigInt(43)],
      tier: [1, 2],
    });
    expect(() => parseEventArgs('{"id":9007199254740993}', event)).toThrow("safe integer");
    expect(() => parseEventArgs('{"id":-1}', event)).toThrow("valid uint256");
    expect(() => parseEventArgs('{"tier":128}', event)).toThrow("valid int8");
    expect(() => parseEventArgs('{"id":true}', event)).toThrow("must be an integer");
  });

  test("turns a decoded log into a JSON-safe payload", () => {
    expect(
      eventPayload(
        {
          address: usdc,
          eventName: "Transfer",
          args: { from: alice, to: bob, value: BigInt(1_000_000) },
          blockNumber: BigInt(12),
          blockHash: "0xbb" as Hex,
          transactionHash: "0xcc" as Hex,
          logIndex: 3,
        },
        84532,
      ),
    ).toEqual({
      event: "Transfer",
      args: { from: alice, to: bob, value: "1000000" },
      address: usdc,
      blockNumber: "12",
      blockHash: "0xbb",
      transactionHash: "0xcc",
      logIndex: 3,
      chainId: 84532,
    });
  });
});

describe("event reader", () => {
  const event = parseEventSignature(transfer);

  /** A raw JSON-RPC log the way a node returns it. */
  function rawLog(from: Address, to: Address, value: bigint, block: number, index: number) {
    return {
      address: usdc,
      topics: encodeEventTopics({ abi: [event], eventName: "Transfer", args: { from, to } }),
      data: encodeAbiParameters([{ type: "uint256" }], [value]),
      blockNumber: numberToHex(block),
      blockHash: pad(numberToHex(block * 1000), { size: 32 }),
      transactionHash: pad(numberToHex(block * 7 + index), { size: 32 }),
      transactionIndex: "0x0",
      logIndex: numberToHex(index),
      removed: false,
    };
  }

  test("asks for the filtered range and decodes what comes back", async () => {
    const requests: { method: string; params: unknown[] }[] = [];
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown[] }) {
        requests.push({ method, params: params ?? [] });
        if (method === "eth_blockNumber") return numberToHex(120);
        if (method === "eth_getLogs")
          return [
            rawLog(alice, bob, BigInt(2_500_000), 101, 2),
            rawLog(bob, alice, BigInt(1), 110, 0),
          ];
        throw new Error(`Unexpected ${method}`);
      },
    });
    const reader = createEventReader(createPublicClient({ transport }));
    expect(await reader.getBlockNumber()).toBe(BigInt(120));
    const logs = await reader.getLogs({
      address: usdc,
      event,
      args: { to: bob },
      fromBlock: BigInt(100),
      toBlock: BigInt(120),
    });
    const filter = requests.find((request) => request.method === "eth_getLogs")?.params[0] as {
      address: string;
      fromBlock: string;
      toBlock: string;
      topics: (string | null)[];
    };
    expect(filter.address).toBe(usdc);
    expect(filter.fromBlock).toBe(numberToHex(100));
    expect(filter.toBlock).toBe(numberToHex(120));
    // Topic 0 is the event, topic 1 (from) is open, topic 2 (to) is the filter value.
    expect(filter.topics[1]).toBeNull();
    expect(filter.topics[2]).toBe(pad(bob, { size: 32 }));
    // The second log (to alice) does not match the filter; viem drops it client-side too.
    expect(logs).toEqual([
      {
        address: usdc,
        eventName: "Transfer",
        args: { from: alice, to: bob, value: BigInt(2_500_000) },
        blockNumber: BigInt(101),
        blockHash: pad(numberToHex(101_000), { size: 32 }),
        transactionHash: pad(numberToHex(101 * 7 + 2), { size: 32 }),
        logIndex: 2,
      },
    ]);
  });

  test("leaves pending logs out", async () => {
    const transport = custom({
      async request({ method }: { method: string }) {
        if (method === "eth_getLogs")
          return [{ ...rawLog(alice, bob, BigInt(1), 5, 0), blockNumber: null, logIndex: null }];
        throw new Error(`Unexpected ${method}`);
      },
    });
    const reader = createEventReader(createPublicClient({ transport }));
    expect(
      await reader.getLogs({ address: usdc, event, fromBlock: BigInt(1), toBlock: BigInt(5) }),
    ).toEqual([]);
  });

  test("retains matching logs when indexed integer filters arrive as JSON", async () => {
    const ticket = parseEventSignature("Ticket(uint256 indexed id, uint8 indexed tier)");
    const raw = {
      ...rawLog(alice, bob, BigInt(1), 5, 0),
      topics: encodeEventTopics({
        abi: [ticket],
        eventName: "Ticket",
        args: { id: BigInt(42), tier: 2 },
      }),
      data: "0x",
    };
    const transport = custom({
      async request({ method }: { method: string }) {
        if (method === "eth_getLogs") return [raw];
        throw new Error(`Unexpected ${method}`);
      },
    });
    const reader = createEventReader(createPublicClient({ transport }));
    for (const args of [
      '{"id":42,"tier":2}',
      '{"id":"42","tier":"2"}',
      '{"id":["41",42],"tier":[1,"2"]}',
    ]) {
      const logs = await reader.getLogs({
        address: usdc,
        event: ticket,
        args: parseEventArgs(args, ticket),
        fromBlock: BigInt(1),
        toBlock: BigInt(5),
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.args).toEqual({ id: BigInt(42), tier: 2 });
    }
  });

  test("leaves removed logs and logs without a block hash out", async () => {
    const transport = custom({
      async request({ method }: { method: string }) {
        if (method === "eth_getLogs")
          return [
            { ...rawLog(alice, bob, BigInt(1), 5, 0), removed: true },
            { ...rawLog(alice, bob, BigInt(1), 5, 1), blockHash: null },
            rawLog(alice, bob, BigInt(1), 5, 2),
          ];
        throw new Error(`Unexpected ${method}`);
      },
    });
    const reader = createEventReader(createPublicClient({ transport }));
    const logs = await reader.getLogs({
      address: usdc,
      event,
      fromBlock: BigInt(1),
      toBlock: BigInt(5),
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.logIndex).toBe(2);
  });
});
