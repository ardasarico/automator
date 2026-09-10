import { chains, defaultChainId, isChainId } from "@automator/contracts";
import type { PaymentPolicyStore } from "@automator/db";
import type { ChainMode, ChainProvider, ChainReader, ChainSigner } from "@automator/flow-engine";
import type { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Address,
  type Chain,
  type Transport,
} from "viem";
import * as knownChains from "viem/chains";
import type { EmbeddedWallet, IdentityProvider } from "../auth/privy";
import type { ApiConfig } from "../config";
import { createEventReader, type EventReader } from "./events";
import { createPaymentPolicySigner } from "./payment-policy";
import { createPaymentReader, type PaymentReader } from "./visitor-payments";

export { defaultChainId } from "@automator/contracts";

const erc20DecimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);

export interface ChainSettings {
  chainId: number;
  rpcUrl: string;
  usdcAddress?: Address;
}

export interface SigningSettings {
  privy: PrivyClient;
  /** The authorization key's private key from the Privy dashboard (base64 PKCS8, no PEM headers). */
  authorizationKey: string;
  /** Must match NEXT_PUBLIC_PRIVY_SIGNER_ID and the authorization key registered in Privy. */
  signerId: string;
}

export interface ConfiguredChain {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  reader: ChainReader;
  eventReader: EventReader;
  /** Turns a visitor's transaction hash into the transfers it made, for `usdc.payment`. */
  payments: PaymentReader;
  /**
   * The payment token's decimals, read once and kept: the contract is fixed for the chain's life.
   * Null when the chain has no configured USDC.
   */
  usdcDecimals(): Promise<number | null>;
  usdcAddress?: Address;
}

export interface ChainFactory {
  readonly chainIds: readonly number[];
  readonly canSign: boolean;
  chain(chainId: number): ConfiguredChain | undefined;
  forUser(userId: string, mode: ChainMode, chainId?: number): Promise<ChainProvider>;
  wallet(userId: string): Promise<(EmbeddedWallet & { signing?: boolean }) | null>;
}

type ChainEnvironment = Pick<ApiConfig, "chainId" | "chainRpcUrl" | "usdcAddress" | "chainRpcUrls">;

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

export function createChainFactory(
  settings: readonly ChainSettings[],
  identity: IdentityProvider | undefined,
  signing: SigningSettings | undefined,
  transportFor: (settings: ChainSettings) => Transport = (chain) => http(chain.rpcUrl),
  paymentPolicies?: Pick<PaymentPolicyStore, "reserve">,
): ChainFactory {
  const configured = new Map<number, ConfiguredChain & { chain: Chain; transport: Transport }>();
  for (const entry of settings) {
    const chain = resolveChain(entry.chainId, entry.rpcUrl);
    const transport = transportFor(entry);
    const client = createPublicClient({ chain, transport });
    const usdcAddress = entry.usdcAddress;
    let decimals: Promise<number | null> | undefined;
    configured.set(entry.chainId, {
      chainId: chain.id,
      chainName: chain.name,
      nativeSymbol: chain.nativeCurrency.symbol,
      chain,
      transport,
      reader: createReader(chain, transport),
      eventReader: createEventReader(client),
      payments: createPaymentReader(client),
      usdcDecimals: () => {
        if (!usdcAddress) return Promise.resolve(null);
        // A failed read is not cached, so a flaky RPC does not poison the chain for the process.
        decimals ??= client
          .readContract({ address: usdcAddress, abi: erc20DecimalsAbi, functionName: "decimals" })
          .then((value) => Number(value))
          .catch((error: unknown) => {
            decimals = undefined;
            throw error;
          });
        return decimals;
      },
      ...(usdcAddress ? { usdcAddress } : {}),
    });
  }
  const wallet: ChainFactory["wallet"] = async (userId) => {
    const found = identity?.embeddedWallet ? await identity.embeddedWallet(userId) : null;
    if (!found || !signing) return found;
    const current = await signing.privy.wallets().get(found.id);
    return {
      ...found,
      signing:
        current.id === found.id &&
        current.chain_type === "ethereum" &&
        current.address.toLowerCase() === found.address.toLowerCase() &&
        current.additional_signers.some((signer) => signer.signer_id === signing.signerId),
    };
  };
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
      let found: Awaited<ReturnType<ChainFactory["wallet"]>>;
      try {
        found = await wallet(userId);
      } catch {
        return {
          ...base,
          signerUnavailableReason:
            "Wallet signing permission could not be verified with Privy; retry the run",
        };
      }
      if (!found)
        return { ...base, signerUnavailableReason: "This account has no embedded wallet" };
      const account = found.address as Address;
      if (!signing)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY and PRIVY_SIGNER_ID)",
        };
      if (!found.signing)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not enabled for this wallet; enable the configured app signer from the builder",
        };
      const signer = createSigner(entry.chain, entry.transport, signing, {
        id: found.id,
        address: account,
      });
      return {
        ...base,
        account,
        signer: paymentPolicies
          ? createPaymentPolicySigner(
              signer,
              userId,
              entry.chainId,
              entry.usdcAddress,
              paymentPolicies,
            )
          : signer,
      };
    },
  };
}
