import { chains, defaultChainId, isChainId } from "@automator/contracts";
import type { ChainMode, ChainProvider, ChainReader, ChainSigner } from "@automator/flow-engine";
import type { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Transport,
} from "viem";
import * as knownChains from "viem/chains";
import type { EmbeddedWallet, IdentityProvider } from "../auth/privy";
import type { ApiConfig } from "../config";
import { createEventReader, type EventReader } from "./events";

export { defaultChainId } from "@automator/contracts";

export interface ChainSettings {
  chainId: number;
  rpcUrl: string;
  /** The USDC contract on the chain; absent when unknown. */
  usdcAddress?: Address;
}

/** What the API needs to sign with a user's embedded wallet. */
export interface SigningSettings {
  privy: PrivyClient;
  /** The authorization key's private key from the Privy dashboard (base64 PKCS8, no PEM headers). */
  authorizationKey: string;
}

/** One configured chain: its readers and USDC, shared by every run on it. */
export interface ConfiguredChain {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  reader: ChainReader;
  eventReader: EventReader;
  usdcAddress?: Address;
}

export interface ChainFactory {
  /** The chains a run may ask for, registry order. */
  readonly chainIds: readonly number[];
  /** Whether the API holds a Privy authorization key, so a granted wallet can sign. */
  readonly canSign: boolean;
  chain(chainId: number): ConfiguredChain | undefined;
  /**
   * A provider for the user's run on `chainId` (the default chain without one): reads
   * always work; signing needs a delegated wallet and a key. Throws for an unconfigured chain.
   */
  forUser(userId: string, mode: ChainMode, chainId?: number): Promise<ChainProvider>;
  /** The user's embedded wallet, the same address on every chain; `null` without one. */
  wallet(userId: string): Promise<EmbeddedWallet | null>;
}

type ChainEnvironment = Pick<ApiConfig, "chainId" | "chainRpcUrl" | "usdcAddress" | "chainRpcUrls">;

/**
 * The registry chains with the environment's overrides: `CHAIN_RPC_URL_<id>` replaces one
 * chain's RPC, and the legacy `CHAIN_ID` / `CHAIN_RPC_URL` / `USDC_ADDRESS` trio still applies
 * to the chain it names (a per-chain URL wins over it). A `CHAIN_ID` off the registry is
 * reported and its companions ignored, so a flow can never select a chain the API lacks.
 */
export function resolveChainSettings(
  env: ChainEnvironment,
  warn: (line: string) => void = (line) => console.warn(line),
): ChainSettings[] {
  if (!isChainId(env.chainId))
    warn(
      `CHAIN_ID ${env.chainId} is not in the chain registry; CHAIN_RPC_URL and USDC_ADDRESS are ignored`,
    );
  for (const id of Object.keys(env.chainRpcUrls))
    if (!isChainId(Number(id)))
      warn(`CHAIN_RPC_URL_${id} names a chain that is not in the registry; ignored`);
  return chains.map((chain) => {
    const legacy = chain.id === env.chainId;
    const rpcUrl = env.chainRpcUrls[String(chain.id)] ?? (legacy ? env.chainRpcUrl : chain.rpcUrl);
    const usdcAddress = legacy && env.usdcAddress ? env.usdcAddress : chain.usdcAddress;
    return {
      chainId: chain.id,
      rpcUrl,
      ...(usdcAddress ? { usdcAddress: usdcAddress as Address } : {}),
    };
  });
}

export function resolveChain(chainId: number, rpcUrl: string): Chain {
  const known = (Object.values(knownChains) as Chain[]).find(
    (candidate) => candidate.id === chainId,
  );
  if (known) return { ...known, rpcUrls: { default: { http: [rpcUrl] } } };
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** The engine's reader over a viem public client. */
export function createReader(chain: Chain, transport: Transport): ChainReader {
  const client = createPublicClient({ chain, transport });
  return {
    readContract: (call) => client.readContract(call as never),
    simulateContract: async (call) => (await client.simulateContract(call as never)).result,
    estimateContractGas: (call) => client.estimateContractGas(call as never),
    estimateGas: (request) => client.estimateGas(request),
    getBalance: (address) => client.getBalance({ address }),
    waitForTransactionReceipt: async (hash) => {
      const receipt = await client.waitForTransactionReceipt({ hash });
      return {
        transactionHash: receipt.transactionHash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      };
    },
  };
}

/** The engine's signer over a viem wallet client whose account signs through Privy. */
export function createSigner(
  chain: Chain,
  transport: Transport,
  signing: SigningSettings,
  wallet: { id: string; address: Address },
): ChainSigner {
  const account = createViemAccount(signing.privy, {
    walletId: wallet.id,
    address: wallet.address,
    authorizationContext: { authorization_private_keys: [signing.authorizationKey] },
  });
  const client = createWalletClient({ account, chain, transport });
  return {
    address: wallet.address,
    writeContract: (call) => client.writeContract(call as never),
    sendTransaction: (request) => client.sendTransaction(request),
    signMessage: (message) => client.signMessage({ message }),
    signTransaction: async (request) => {
      const prepared = await client.prepareTransactionRequest(request);
      return client.signTransaction(prepared as never);
    },
  };
}

/**
 * One factory for every configured chain. Privy signers are chain-agnostic: the wallet is
 * the same address everywhere, only the client it signs through changes per chain.
 */
export function createChainFactory(
  settings: readonly ChainSettings[],
  identity: IdentityProvider | undefined,
  signing: SigningSettings | undefined,
  transportFor: (settings: ChainSettings) => Transport = (chain) => http(chain.rpcUrl),
): ChainFactory {
  const configured = new Map<number, ConfiguredChain & { chain: Chain; transport: Transport }>();
  for (const entry of settings) {
    const chain = resolveChain(entry.chainId, entry.rpcUrl);
    const transport = transportFor(entry);
    configured.set(entry.chainId, {
      chainId: chain.id,
      chainName: chain.name,
      nativeSymbol: chain.nativeCurrency.symbol,
      chain,
      transport,
      reader: createReader(chain, transport),
      eventReader: createEventReader(createPublicClient({ chain, transport })),
      ...(entry.usdcAddress ? { usdcAddress: entry.usdcAddress } : {}),
    });
  }
  const wallet = async (userId: string) =>
    identity?.embeddedWallet ? await identity.embeddedWallet(userId) : null;
  return {
    chainIds: [...configured.keys()],
    canSign: signing !== undefined,
    chain: (chainId) => configured.get(chainId),
    wallet,
    async forUser(userId, mode, chainId = defaultChainId) {
      const entry = configured.get(chainId);
      if (!entry) throw new Error(`Chain ${chainId} is not configured`);
      const base: ChainProvider = {
        chainId: entry.chainId,
        chainName: entry.chainName,
        mode,
        reader: entry.reader,
        ...(entry.usdcAddress ? { usdcAddress: entry.usdcAddress } : {}),
      };
      const found = await wallet(userId);
      if (!found)
        return { ...base, signerUnavailableReason: "This account has no embedded wallet" };
      const account = found.address as Address;
      if (!signing)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY)",
        };
      if (!found.delegated)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not enabled for this wallet; enable it from the builder",
        };
      return {
        ...base,
        account,
        signer: createSigner(entry.chain, entry.transport, signing, {
          id: found.id,
          address: account,
        }),
      };
    },
  };
}
