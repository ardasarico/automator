import {
  accountUsageContract,
  parseAuthError,
  parseResponse,
  type AccountUsage,
} from "@automator/contracts";

export class AccountRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AccountRequestError";
  }
}

/** Reads the signed-in user's usage counts through the same-origin proxy. */
export async function getAccountUsageRequest(token: string | null): Promise<AccountUsage> {
  if (!token) throw new AccountRequestError("unauthorized");
  const response = await fetch(`/api${accountUsageContract.path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new AccountRequestError(parseAuthError(data).error);
  const result = parseResponse(accountUsageContract, response.status, data);
  if (result.status !== 200) throw new AccountRequestError(result.data.error);
  return result.data;
}
