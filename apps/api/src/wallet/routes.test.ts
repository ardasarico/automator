import { describe, expect, test } from "bun:test";
import {
  getWalletContract,
  getWalletTransactionsContract,
  parseResponse,
  type FlowDocument,
  type FlowRun,
} from "@automator/contracts";
import { Elysia } from "elysia";
import { custom, encodeFunctionResult, numberToHex, parseAbi, type Address } from "viem";
import type { IdentityProvider } from "../auth/privy";
import { createChainFactory, resolveChainSettings } from "../chain/provider";
import { memoryStores } from "../runs/test-stores";
import { createWalletRoutes } from "./routes";
import { collectWalletTransactions } from "./transactions";

const hashA = `0x${"aa".repeat(32)}`;
const hashB = `0x${"bb".repeat(32)}`;
const hashC = `0x${"cc".repeat(32)}`;

const payout: FlowDocument = {
  version: 1,
  id: "flow-pay",
  name: "Payout",
  description: "",
  chainId: 4801,
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    { id: "send", type: "usdc.payout", position: { x: 1, y: 0 }, label: "Send", config: {} },
    {
      id: "call",
      type: "onchain.write-contract",
      position: { x: 2, y: 0 },
      label: "Call",
      config: { chainId: 84532 },
    },
  ],
  edges: [],
};

function run(id: string, startedAt: string, nodes: FlowRun["nodes"]): FlowRun {
  return {
    id,
    flowId: payout.id,
    status: "succeeded",
    startedAt,
    finishedAt: startedAt,
    trigger: { nodeId: "t" },
    nodes,
    variables: {},
  };
}

describe("collectWalletTransactions", () => {
  test("lists live receipt hashes newest first with the document's chain and node time", () => {
    const older = run("r-old", "2026-09-07T09:00:00.000Z", [
      { nodeId: "t", status: "succeeded", outputs: { run: {} } },
      {
        nodeId: "send",
        status: "succeeded",
        finishedAt: "2026-09-07T09:00:02.000Z",
        outputs: {
          receipt: { simulated: false, hash: hashA },
          echo: { receipt: { transactionHash: hashA } },
        },
      },
      {
        nodeId: "call",
        status: "succeeded",
        outputs: { receipt: { simulated: false, hash: hashB } },
      },
    ]);
    const newer = run("r-new", "2026-09-07T10:00:00.000Z", [
      { nodeId: "t", status: "succeeded", outputs: { run: {} } },
      { nodeId: "send", status: "failed", error: "insufficient funds" },
      { nodeId: "call", status: "skipped" },
      { nodeId: "ghost", status: "succeeded", outputs: { receipt: { hash: hashC } } },
    ]);
    const records = [
      { run: newer, flowName: "Payout", source: "manual" as const, document: payout },
      { run: older, flowName: "Payout", source: "manual" as const, document: payout },
    ];
    expect(collectWalletTransactions(records)).toEqual([
      {
        hash: hashA,
        chainId: 4801,
        flowId: "flow-pay",
        flowName: "Payout",
        runId: "r-old",
        nodeId: "send",
        nodeType: "usdc.payout",
        at: "2026-09-07T09:00:02.000Z",
      },
      {
        hash: hashB,
        chainId: 4801,
        flowId: "flow-pay",
        flowName: "Payout",
        runId: "r-old",
        nodeId: "call",
        nodeType: "onchain.write-contract",
        at: "2026-09-07T09:00:00.000Z",
      },
    ]);
    expect(collectWalletTransactions(records, 1).map((t) => t.hash)).toEqual([hashA]);
  });
});

describe("GET /wallet/transactions", () => {
  test("needs a session and a run store", async () => {
    const { runs } = memoryStores([]);
    const call = app(createWalletRoutes({ identity: identity(null), runs }));
    expect((await call("/wallet/transactions")).status).toBe(401);
    const without = app(createWalletRoutes({ identity: identity(null) }));
    const response = await without("/wallet/transactions", "alice");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  test("answers the caller's own transactions, newest first", async () => {
    const { runs } = memoryStores([{ ownerId: "did:privy:alice", flow: payout }]);
    await runs.create(
      "did:privy:alice",
      payout,
      run("r1", "2026-09-07T09:00:00.000Z", [
        {
          nodeId: "send",
          status: "succeeded",
          outputs: { receipt: { simulated: false, hash: hashA } },
        },
      ]),
    );
    await runs.create(
      "did:privy:alice",
      payout,
      run("r2", "2026-09-07T10:00:00.000Z", [
        {
          nodeId: "send",
          status: "succeeded",
          outputs: { receipt: { simulated: false, hash: hashB } },
        },
      ]),
    );
    await runs.create(
      "did:privy:bob",
      payout,
      run("r3", "2026-09-07T11:00:00.000Z", [
        {
          nodeId: "send",
          status: "succeeded",
          outputs: { receipt: { simulated: false, hash: hashC } },
        },
      ]),
    );
    const call = app(createWalletRoutes({ identity: identity(null), runs }));
    const response = await call("/wallet/transactions", "alice");
    expect(response.status).toBe(200);
    const parsed = parseResponse(getWalletTransactionsContract, 200, await response.json());
    expect(parsed.status).toBe(200);
    if (parsed.status !== 200) return;
    expect(parsed.data.transactions.map((t) => [t.hash, t.runId, t.chainId])).toEqual([
      [hashB, "r2", 4801],
      [hashA, "r1", 4801],
    ]);
  });
});

const user = "0x1111111111111111111111111111111111111111" as Address;
const erc20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

function identity(wallet: { id: string; address: string; delegated: boolean } | null) {
  const provider: IdentityProvider = {
    verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 2e9 } : null),
    walletAddress: async () => wallet?.address ?? null,
    embeddedWallet: async () => wallet,
  };
  return provider;
}

/** Balances per chain id: native in wei, USDC in its six-decimal units. */
function factory(
  wallet: { id: string; address: string; delegated: boolean } | null,
  balances: Record<number, { native: bigint; usdc: bigint }>,
  signing = false,
) {
  return createChainFactory(
    resolveChainSettings({
      chainId: 84532,
      chainRpcUrl: "https://base.example",
      usdcAddress: undefined,
      chainRpcUrls: {},
    }),
    identity(wallet),
    signing
      ? {
          privy: {
            wallets: () => ({
              get: async () => ({
                id: wallet?.id,
                address: wallet?.address,
                chain_type: "ethereum",
                additional_signers: wallet?.delegated ? [{ signer_id: "app-signer" }] : [],
              }),
            }),
          } as never,
          authorizationKey: "key",
          signerId: "app-signer",
        }
      : undefined,
    (settings) =>
      custom({
        async request({ method }: { method: string }) {
          const balance = balances[settings.chainId];
          if (!balance) throw new Error("RPC down");
          if (method === "eth_chainId") return numberToHex(settings.chainId);
          if (method === "eth_getBalance") return numberToHex(balance.native);
          if (method === "eth_call")
            return encodeFunctionResult({
              abi: erc20,
              functionName: "balanceOf",
              result: balance.usdc,
            });
          throw new Error(`Unexpected ${method}`);
        },
      }),
  );
}

function app(routes: ReturnType<typeof createWalletRoutes>) {
  const instance = new Elysia().use(routes);
  return (path: string, token?: string) =>
    instance.handle(
      new Request(`http://localhost${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
}

describe("GET /wallet", () => {
  const funded = {
    84532: { native: BigInt(5) * BigInt(10) ** BigInt(16), usdc: BigInt(12_500_000) },
  };
  const wallet = { id: "w1", address: user, delegated: true };

  test("needs a session", async () => {
    const call = app(
      createWalletRoutes({ identity: identity(wallet), chainFactory: factory(wallet, funded) }),
    );
    expect((await call("/wallet")).status).toBe(401);
    expect((await call("/wallet", "bob")).status).toBe(401);
  });

  test("answers the default chain's balances, signing omitted without a key", async () => {
    const call = app(
      createWalletRoutes({ identity: identity(wallet), chainFactory: factory(wallet, funded) }),
    );
    const response = await call("/wallet", "alice");
    expect(response.status).toBe(200);
    expect(parseResponse(getWalletContract, 200, await response.json()).data).toEqual({
      address: user,
      chainId: 84532,
      chainName: "Base Sepolia",
      nativeBalance: "0.05",
      nativeSymbol: "ETH",
      usdcBalance: "12.5",
    });
  });

  test("reports the signer grant when the API can sign, per chain", async () => {
    const balances = { ...funded, 4801: { native: BigInt(0), usdc: BigInt(0) } };
    const call = app(
      createWalletRoutes({
        identity: identity(wallet),
        chainFactory: factory({ ...wallet, delegated: false }, balances, true),
      }),
    );
    const response = await call("/wallet?chainId=4801", "alice");
    expect(await response.json()).toEqual({
      address: user,
      chainId: 4801,
      chainName: "World Chain Sepolia",
      nativeBalance: "0",
      nativeSymbol: "ETH",
      usdcBalance: "0",
      signing: false,
    });
  });

  test("refuses a chain off the registry and reports a missing wallet", async () => {
    const call = app(
      createWalletRoutes({ identity: identity(null), chainFactory: factory(null, funded) }),
    );
    expect((await call("/wallet?chainId=1", "alice")).status).toBe(400);
    expect((await call("/wallet?chainId=abc", "alice")).status).toBe(400);
    const missing = await call("/wallet", "alice");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });

  test("answers 503 without a chain provider or when the RPC fails", async () => {
    expect(
      (await app(createWalletRoutes({ identity: identity(wallet) }))("/wallet", "alice")).status,
    ).toBe(503);
    const call = app(
      createWalletRoutes({ identity: identity(wallet), chainFactory: factory(wallet, {}) }),
    );
    const response = await call("/wallet", "alice");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
