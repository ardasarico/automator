import { describe, expect, test } from "bun:test";
import type { FlowDocument, FlowRunRecord } from "@automator/contracts";
import { createStubChain, runFlow } from "@automator/flow-engine";
import { collectWalletTransactions } from "./transactions";

const hash = `0x${"ab".repeat(32)}` as const;
const otherHash = `0x${"cd".repeat(32)}` as const;
const address = "0x1111111111111111111111111111111111111111";

const document: FlowDocument = {
  version: 1,
  id: "wallet-history",
  name: "Wallet history",
  description: "",
  chainId: 4801,
  nodes: [
    { id: "trigger", type: "trigger.manual", label: "Run", position: { x: 0, y: 0 }, config: {} },
    {
      id: "write",
      type: "onchain.write-contract",
      label: "Write",
      position: { x: 1, y: 0 },
      config: {
        address,
        abi: "function transfer(address to, uint256 amount) returns ((bytes32 hash) receipt)",
        functionName: "transfer",
        args: JSON.stringify([address, "1"]),
        chainId: 84532,
      },
    },
  ],
  edges: [{ id: "start", source: "trigger", sourceHandle: "run", target: "write" }],
};

async function execute(mode: "dry-run" | "live", flow = document): Promise<FlowRunRecord> {
  const stub = createStubChain({ mode, chainId: flow.chainId });
  const run = await runFlow(flow, {
    now: () => new Date("2026-09-07T09:00:00.000Z"),
    trigger: { payload: { transactionHash: otherHash } },
    chain: {
      ...stub,
      reader: {
        ...stub.reader,
        simulateContract: async () => ({ hash: otherHash }),
      },
      signer: { ...stub.signer!, writeContract: async () => hash },
    },
  });
  expect(run.status).toBe("succeeded");
  return { run, document: flow, flowName: flow.name, source: "manual" };
}

describe("wallet transaction provenance", () => {
  test("ignores trigger payloads and simulated contract return values", async () => {
    const record = await execute("dry-run");
    expect(record.run.nodes[1]?.outputs).toMatchObject({
      receipt: { simulated: true, result: { hash: otherHash } },
    });
    expect(
      collectWalletTransactions([
        { ...record, run: { ...record.run, nodes: record.run.nodes.slice(1) } },
      ]),
    ).toEqual([]);
    expect(collectWalletTransactions([record])).toEqual([]);
  });

  test("lists only the actual write receipt on the document's execution chain", async () => {
    const record = await execute("live");
    expect(collectWalletTransactions([record])).toEqual([
      expect.objectContaining({ hash, chainId: 4801, nodeId: "write" }),
    ]);
  });

  test("does not mistake an observed onchain event for a wallet transaction", async () => {
    const flow: FlowDocument = {
      ...document,
      nodes: [{ ...document.nodes[0]!, type: "trigger.onchain-event" }],
      edges: [],
    };
    expect(collectWalletTransactions([await execute("live", flow)])).toEqual([]);
  });

  test("preserves the same transaction hash on different chains and deduplicates its casing", async () => {
    const world = await execute("live");
    const base = await execute("live", { ...document, chainId: 84532 });
    const duplicate = structuredClone(world);
    duplicate.run.nodes[1]!.outputs!.receipt = {
      simulated: false,
      hash: `0x${hash.slice(2).toUpperCase()}`,
    };
    expect(
      collectWalletTransactions([world, base, duplicate]).map((transaction) => [
        transaction.hash,
        transaction.chainId,
      ]),
    ).toEqual([
      [hash, 4801],
      [hash, 84532],
    ]);
  });
});
