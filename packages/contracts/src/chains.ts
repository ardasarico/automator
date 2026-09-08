import { Type } from "@sinclair/typebox";

export interface ChainInfo {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  usdcAddress?: string;
}

export const chains = [
  {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    id: 4801,
    name: "World Chain Sepolia",
    rpcUrl: "https://worldchain-sepolia.g.alchemy.com/public",
    explorerUrl: "https://worldchain-sepolia.explorer.alchemy.com",
    nativeSymbol: "ETH",
    usdcAddress: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  },
] as const satisfies readonly ChainInfo[];

export type ChainId = (typeof chains)[number]["id"];
export const chainIds: readonly ChainId[] = chains.map((chain) => chain.id);

export const defaultChainId: ChainId = 84532;

/** `Unsafe` pins the literal union, which a mapped `Type.Union` would otherwise widen. */
export const chainIdSchema = Type.Unsafe<ChainId>(
  Type.Union(chains.map((chain) => Type.Literal(chain.id))),
);

export function isChainId(value: unknown): value is ChainId {
  return typeof value === "number" && (chainIds as readonly number[]).includes(value);
}

export function getChain(id: number): ChainInfo | undefined {
  return chains.find((chain) => chain.id === id);
}

export function chainName(id: number): string {
  return getChain(id)?.name ?? `Chain ${id}`;
}

export function explorerTransactionUrl(chainId: number, hash: string): string | undefined {
  const chain = getChain(chainId);
  return chain ? `${chain.explorerUrl}/tx/${hash}` : undefined;
}

export function explorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = getChain(chainId);
  return chain ? `${chain.explorerUrl}/address/${address}` : undefined;
}
