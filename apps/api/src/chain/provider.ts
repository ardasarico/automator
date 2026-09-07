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
import type { IdentityProvider } from "../auth/privy";

export { defaultChainId, defaultRpcUrl, defaultUsdcAddress } from "../config";

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

export interface ChainFactory {
  readonly chainId: number;
  readonly chainName: string;
  /** A provider for the user's run: reads always work; signing needs a delegated wallet and a key. */
  forUser(userId: string, mode: ChainMode): Promise<ChainProvider>;
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

export function createChainFactory(
  settings: ChainSettings,
  identity: IdentityProvider | undefined,
  signing: SigningSettings | undefined,
  transport: Transport = http(settings.rpcUrl),
): ChainFactory {
  const chain = resolveChain(settings.chainId, settings.rpcUrl);
  const reader = createReader(chain, transport);
  return {
    chainId: chain.id,
    chainName: chain.name,
    async forUser(userId, mode) {
      const base: ChainProvider = {
        chainId: chain.id,
        chainName: chain.name,
        mode,
        reader,
        ...(settings.usdcAddress ? { usdcAddress: settings.usdcAddress } : {}),
      };
      const wallet = identity?.embeddedWallet ? await identity.embeddedWallet(userId) : null;
      if (!wallet)
        return { ...base, signerUnavailableReason: "This account has no embedded wallet" };
      const account = wallet.address as Address;
      if (!signing)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY)",
        };
      if (!wallet.delegated)
        return {
          ...base,
          account,
          signerUnavailableReason:
            "Server signing is not enabled for this wallet; enable it from the builder",
        };
      return {
        ...base,
        account,
        signer: createSigner(chain, transport, signing, { id: wallet.id, address: account }),
      };
    },
  };
}
