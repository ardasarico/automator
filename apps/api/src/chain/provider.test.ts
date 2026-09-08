import { describe, expect, test } from "bun:test";
import type { PaymentPolicyOperation } from "@automator/db";
import { custom, encodeAbiParameters, encodeFunctionResult, parseAbi, type Address } from "viem";
import type { IdentityProvider } from "../auth/privy";
import { createChainFactory, resolveChain, resolveChainSettings } from "./provider";

const user = "0x1111111111111111111111111111111111111111" as Address;
const abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const baseUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const worldUsdc = "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88";

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

const legacyDefaults = {
  chainId: 84532,
  chainRpcUrl: "https://sepolia.base.org",
  usdcAddress: baseUsdc,
  chainRpcUrls: {},
};

describe("chain settings", () => {
  test("every registry chain with its public RPC and USDC by default", () => {
    expect(resolveChainSettings(legacyDefaults)).toEqual([
      { chainId: 84532, rpcUrl: "https://sepolia.base.org", usdcAddress: baseUsdc },
      {
        chainId: 4801,
        rpcUrl: "https://worldchain-sepolia.g.alchemy.com/public",
        usdcAddress: worldUsdc,
      },
    ]);
  });

  test("the legacy CHAIN_ID trio overrides its own chain only", () => {
    const settings = resolveChainSettings({
      chainId: 4801,
      chainRpcUrl: "http://localhost:8545",
      usdcAddress: "0xabc",
      chainRpcUrls: {},
    });
    expect(settings[0]).toEqual({
      chainId: 84532,
      rpcUrl: "https://sepolia.base.org",
      usdcAddress: baseUsdc,
    });
    expect(settings[1]).toEqual({
      chainId: 4801,
      rpcUrl: "http://localhost:8545",
      usdcAddress: "0xabc",
    });
  });

  test("CHAIN_RPC_URL_<id> wins over the legacy RPC, and an unknown CHAIN_ID is reported", () => {
    const warnings: string[] = [];
    const settings = resolveChainSettings(
      {
        chainId: 8453,
        chainRpcUrl: "https://mainnet.base.org",
        usdcAddress: undefined,
        chainRpcUrls: { 84532: "https://base.example", 4801: "https://world.example", 1: "x" },
      },
      (line) => warnings.push(line),
    );
    expect(settings.map((chain) => chain.rpcUrl)).toEqual([
      "https://base.example",
      "https://world.example",
    ]);
    expect(warnings).toEqual([
      "CHAIN_ID 8453 is not in the chain registry; CHAIN_RPC_URL and USDC_ADDRESS are ignored",
      "CHAIN_RPC_URL_1 names a chain that is not in the registry; ignored",
    ]);
  });
});

describe("chain provider", () => {
  test("resolves a known chain with the configured RPC and defines unknown ones", () => {
    const base = resolveChain(84532, "https://rpc.example");
    expect(base.name).toBe("Base Sepolia");
    expect(base.rpcUrls.default.http).toEqual(["https://rpc.example"]);
    expect(resolveChain(4801, "https://rpc.example").name).toBe("World Chain Sepolia");
    expect(resolveChain(999999, "https://x").name).toBe("Chain 999999");
  });

  test("reads through eth_call and decodes the result", async () => {
    const { transport, calls } = fakeTransport({
      eth_call: () => encodeFunctionResult({ abi, functionName: "balanceOf", result: 42n }),
      eth_chainId: () => "0x14a34",
    });
    const factory = createChainFactory(
      [{ chainId: 84532, rpcUrl: "https://rpc.example" }],
      identity(null),
      undefined,
      () => transport,
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
    expect(factory.canSign).toBe(false);
    expect(await factory.wallet("did:privy:alice")).toBeNull();
  });

  test("builds the provider for the chain the run asks for, with that chain's USDC", async () => {
    const transports = new Map<number, ReturnType<typeof fakeTransport>>();
    const factory = createChainFactory(
      resolveChainSettings(legacyDefaults),
      identity({ id: "w1", address: user, delegated: false }),
      undefined,
      (settings) => {
        const fake = fakeTransport({ eth_chainId: () => `0x${settings.chainId.toString(16)}` });
        transports.set(settings.chainId, fake);
        return fake.transport;
      },
    );
    expect(factory.chainIds).toEqual([84532, 4801]);
    const base = await factory.forUser("u", "dry-run");
    expect(base).toMatchObject({
      chainId: 84532,
      chainName: "Base Sepolia",
      usdcAddress: baseUsdc,
    });
    const world = await factory.forUser("u", "live", 4801);
    expect(world).toMatchObject({
      chainId: 4801,
      chainName: "World Chain Sepolia",
      mode: "live",
      account: user,
      usdcAddress: worldUsdc,
    });
    expect(world.reader).not.toBe(base.reader);
    expect(factory.chain(4801)?.chainName).toBe("World Chain Sepolia");
    expect(factory.chain(4801)?.eventReader).toBeDefined();
    expect(factory.chain(1)).toBeUndefined();
    await expect(factory.forUser("u", "dry-run", 1)).rejects.toThrow("Chain 1 is not configured");
    expect(await factory.wallet("u")).toEqual({ id: "w1", address: user, delegated: false });
  });

  test("explains why signing is unavailable, step by step", async () => {
    const { transport } = fakeTransport({});
    const settings = [{ chainId: 84532, rpcUrl: "https://rpc.example", usdcAddress: user }];
    const notDelegated = await createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: false }),
      undefined,
      () => transport,
    ).forUser("u", "live");
    expect(notDelegated).toMatchObject({
      account: user,
      usdcAddress: user,
      signerUnavailableReason:
        "Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY and PRIVY_SIGNER_ID)",
    });
    let signerIds = ["another-signer"];
    let checks = 0;
    const signing = {
      privy: {
        wallets: () => ({
          get: async () => {
            checks++;
            return {
              id: "w1",
              address: user,
              chain_type: "ethereum",
              additional_signers: signerIds.map((signer_id) => ({ signer_id })),
            };
          },
        }),
      } as never,
      authorizationKey: "key",
      signerId: "app-signer",
    };
    const withKey = createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: true }),
      signing,
      () => transport,
    );
    expect(withKey.canSign).toBe(true);
    const noGrant = await withKey.forUser("u", "live");
    expect(noGrant.signerUnavailableReason).toContain("not enabled for this wallet");
    signerIds = ["app-signer"];
    const ready = await createChainFactory(
      settings,
      identity({ id: "w1", address: user, delegated: false }),
      signing,
      () => transport,
    ).forUser("u", "live");
    expect(ready.signer?.address).toBe(user);
    expect(ready.signerUnavailableReason).toBeUndefined();
    expect(checks).toBe(2);
    signerIds = ["another-signer"];
    expect((await withKey.forUser("u", "live")).signer).toBeUndefined();
    signing.privy = {
      wallets: () => ({
        get: async () => {
          throw new Error("upstream");
        },
      }),
    } as never;
    expect((await withKey.forUser("u", "live")).signerUnavailableReason).toContain(
      "could not be verified",
    );
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
      [{ chainId: 84532, rpcUrl: "https://rpc.example" }],
      identity(null),
      undefined,
      () => transport,
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

  test("factory signers enforce the injected current policy before Privy or RPC signing", async () => {
    const { transport, calls: rpcCalls } = fakeTransport({});
    const admitted: PaymentPolicyOperation[] = [];
    let enabled = true;
    let privySignCalls = 0;
    let walletChecks = 0;
    const signature = `0x${"a".repeat(130)}` as const;
    const signing = {
      privy: {
        wallets: () => ({
          get: async () => {
            walletChecks++;
            return {
              id: "w1",
              address: user,
              chain_type: "ethereum",
              additional_signers: [{ signer_id: "app-signer" }],
            };
          },
          ethereum: () => ({
            signMessage: async () => {
              privySignCalls++;
              return { signature };
            },
          }),
        }),
      } as never,
      authorizationKey: "key",
      signerId: "app-signer",
    };
    const factory = createChainFactory(
      [{ chainId: 4801, rpcUrl: "https://unused.invalid", usdcAddress: worldUsdc }],
      identity({ id: "w1", address: user, delegated: false }),
      signing,
      () => transport,
      {
        async reserve(ownerId, operation) {
          expect(ownerId).toBe("did:privy:owner");
          admitted.push(operation);
          if (enabled) throw new Error("Current payment policy denies this operation");
          return null;
        },
      },
    );
    // Signing nodes also use the signer in dry-run mode, so the policy must still apply.
    const provider = await factory.forUser("did:privy:owner", "dry-run", 4801);
    const signer = provider.signer!;
    expect(signer.address).toBe(user);
    await expect(signer.sendTransaction({ to: user, value: 1n })).rejects.toThrow(
      "Current payment policy",
    );
    await expect(
      signer.writeContract({
        address: worldUsdc,
        abi: parseAbi(["function transfer(address,uint256) returns (bool)"]),
        functionName: "transfer",
        args: [user, 2n],
      }),
    ).rejects.toThrow("Current payment policy");
    await expect(signer.signMessage("hello")).rejects.toThrow("Current payment policy");
    await expect(signer.signTransaction({ to: user, value: 1n })).rejects.toThrow(
      "Current payment policy",
    );
    expect(admitted.slice(0, 2)).toEqual([
      { kind: "transfer", chainId: 4801, asset: "native", recipient: user, amount: "1" },
      { kind: "transfer", chainId: 4801, asset: "usdc", recipient: user, amount: "2" },
    ]);
    expect(privySignCalls).toBe(0);
    expect(rpcCalls).toEqual([]);

    enabled = false;
    expect(await signer.signMessage("hello")).toBe(signature);
    enabled = true;
    await expect(signer.signMessage("hello again")).rejects.toThrow("Current payment policy");
    expect(privySignCalls).toBe(1);
    expect(walletChecks).toBe(1);
    expect(admitted).toHaveLength(6);
    expect(rpcCalls).toEqual([]);
  });
});
