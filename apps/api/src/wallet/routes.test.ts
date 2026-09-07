import { describe, expect, test } from "bun:test";
import { getWalletContract, parseResponse } from "@automator/contracts";
import { Elysia } from "elysia";
import { custom, encodeFunctionResult, numberToHex, parseAbi, type Address } from "viem";
import type { IdentityProvider } from "../auth/privy";
import { createChainFactory, resolveChainSettings } from "../chain/provider";
import { createWalletRoutes } from "./routes";

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
    signing ? { privy: {} as never, authorizationKey: "key" } : undefined,
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
