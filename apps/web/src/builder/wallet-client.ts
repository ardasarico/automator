import {
  getWalletContract,
  parseAuthError,
  parseResponse,
  type Wallet,
} from "@automator/contracts";

export class WalletRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WalletRequestError";
  }
}

/** The signed-in user's embedded wallet on one chain, through the same-origin proxy. */
export async function fetchWallet(
  token: string | null,
  chainId: number,
  signal?: AbortSignal,
): Promise<Wallet> {
  if (!token) throw new WalletRequestError("unauthorized");
  const response = await fetch(`/api/wallet?chainId=${encodeURIComponent(String(chainId))}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new WalletRequestError(parseAuthError(data).error);
  const result = parseResponse(getWalletContract, response.status, data);
  if (result.status !== 200) throw new WalletRequestError(result.data.error);
  return result.data;
}
