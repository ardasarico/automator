import { describe, expect, test } from "bun:test";
import { custom, encodeAbiParameters, encodeFunctionResult, parseAbi, type Address } from "viem";
import type { IdentityProvider } from "../auth/privy";
import { createChainFactory, resolveChain } from "./provider";

const user = "0x1111111111111111111111111111111111111111" as Address;
const abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** A transport answering canned JSON-RPC, recording every call. */
function fakeTransport(answers: Record<string, (params: unknown[]) => unknown>) {
  const calls: { method: string; params: unknown[] }[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      calls.push({ method, params: params ?? [] });
      const answer = answers[method];
      if (!answer) throw new Error(`Unexpected RPC method ${method}`);
      return answer(params ?? []);
    },
  });
  return { transport, calls };
}

function identity(
  wallet: { id: string; address: string; delegated: boolean } | null,
): IdentityProvider {
  return {
    verify: async () => null,
    walletAddress: async () => wallet?.address ?? null,
    embeddedWallet: async () => wallet,
  };
}

describe("chain provider", () => {
  test("resolves a known chain with the configured RPC and defines unknown ones", () => {
    const base = resolveChain(84532, "https://rpc.example");
    expect(base.name).toBe("Base Sepolia");
    expect(base.rpcUrls.default.http).toEqual(["https://rpc.example"]);
    expect(resolveChain(999999, "https://x").name).toBe("Chain 999999");
  });

  test("reads through eth_call and decodes the result", async () => {
    const { transport, calls } = fakeTransport({
      eth_call: () => encodeFunctionResult({ abi, functionName: "balanceOf", result: 42n }),
      eth_chainId: () => "0x14a34",
    });
    const factory = createChainFactory(
      { chainId: 84532, rpcUrl: "https://rpc.example" },
      identity(null),
      undefined,
      transport,
    );
    const provider = await factory.forUser("did:privy:alice", "dry-run");
    const result = await provider.reader.readContract({
      address: user,
      abi,
      functionName: "balanceOf",
      args: [user],
    });
    expect(result).toBe(42n);
    expect(calls[0]?.method).toBe("eth_call");
    expect(provider.signer).toBeUndefined();
    expect(provider.signerUnavailableReason).toBe("This account has no embedded wallet");
  });

  test("explains why signing is unavailable, step by step", async () => {
    const { transport } = fakeTransport({});
    const settings = { chainId: 84532, rpcUrl: "https://rpc.example", usdcAddress: user };
    const notDelegated = await createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: false }),
      undefined,
      transport,
    ).forUser("u", "live");
    expect(notDelegated).toMatchObject({
      account: user,
      usdcAddress: user,
      signerUnavailableReason:
        "Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY)",
    });
    const signing = { privy: {} as never, authorizationKey: "key" };
    const noGrant = await createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: false }),
      signing,
      transport,
    ).forUser("u", "live");
    expect(noGrant.signerUnavailableReason).toContain("not enabled for this wallet");
    const ready = await createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: true }),
      signing,
      transport,
    ).forUser("u", "live");
    expect(ready.signer?.address).toBe(user);
    expect(ready.signerUnavailableReason).toBeUndefined();
  });

  test("simulateContract surfaces reverts through the reader", async () => {
    const revertData = encodeAbiParameters([{ type: "string" }], ["not owner"]);
    const { transport } = fakeTransport({
      eth_chainId: () => "0x14a34",
      eth_call: () => {
        throw Object.assign(new Error("execution reverted"), {
          code: 3,
          data: `0x08c379a0${revertData.slice(2)}`,
        });
      },
    });
    const provider = await createChainFactory(
      { chainId: 84532, rpcUrl: "https://rpc.example" },
      identity(null),
      undefined,
      transport,
    ).forUser("u", "dry-run");
    await expect(
      provider.reader.simulateContract({
        address: user,
        abi: parseAbi(["function mint()"]),
        functionName: "mint",
        account: user,
      }),
    ).rejects.toThrow();
  });
});
