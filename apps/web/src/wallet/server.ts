import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
  getWalletContract,
  getWalletTransactionsContract,
  type Wallet,
  type WalletTransaction,
} from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth/server";
import { FlowApiError } from "../flows/server";

export type WalletLookup =
  | { status: "ok"; wallet: Wallet }
  | { status: "missing" }
  | { status: "unavailable" };

async function sessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  return token;
}

export async function getWallet(chainId: number): Promise<WalletLookup> {
  const token = await sessionToken();
  let result;
  try {
    result = await request(process.env.API_URL, getWalletContract, {
      token,
      query: { chainId: String(chainId) },
      timeoutMs: 15_000,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { status: "unavailable" };
    throw error;
  }
  if (result.status === 401) redirect("/login");
  if (result.status === 404) return { status: "missing" };
  if (result.status === 503) return { status: "unavailable" };
  if (result.status !== 200) throw new FlowApiError(result.status);
  return { status: "ok", wallet: result.data };
}

export async function listWalletTransactions(): Promise<readonly WalletTransaction[] | null> {
  const token = await sessionToken();
  let result;
  try {
    result = await request(process.env.API_URL, getWalletTransactionsContract, {
      token,
      timeoutMs: 15_000,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return null;
    throw error;
  }
  if (result.status === 401) redirect("/login");
  if (result.status === 503) return null;
  if (result.status !== 200) throw new FlowApiError(result.status);
  return result.data.transactions;
}
