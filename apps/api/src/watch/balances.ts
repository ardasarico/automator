import {
  balanceTriggerConfigSchema,
  parseNodeConfig,
  type BalanceTriggerPayload,
} from "@automator/contracts";
import { isAddress } from "viem";
import { WatchConfigError, formatDecimal, validateDecimals, type Reading } from "./threshold";

/**
 * The Graph's Token API, the balance trigger's data source. One GET returns a wallet's ERC-20
 * and native balances on a mainnet; the trigger picks the watched token out of that page.
 * `fetch` is injected so the poller is testable without the network.
 */

export const tokenApiUrl = "https://api.pinax.network";

/** The native coin, as the config spells it and as the API labels its own entry. */
export const nativeToken = "native";

export interface BalanceReading extends Reading {
  symbol: string;
  /** The ERC-20 contract, or `native`. */
  token: string;
}

export interface BalanceReader {
  read(request: { network: string; address: string; token: string }): Promise<BalanceReading>;
}

/** One entry of the Token API's `data` array, narrowed to the fields the trigger reads. */
interface BalanceRow {
  contract?: unknown;
  amount?: unknown;
  decimals?: unknown;
  symbol?: unknown;
}

function isRow(value: unknown): value is BalanceRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads balances through the Token API. Failures raise a plain `Error` (the poll retries next
 * tick); a config the API cannot serve raises `WatchConfigError`, which the scheduler logs
 * as a configuration problem.
 */
export function createBalanceReader({
  apiKey,
  baseUrl = tokenApiUrl,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): BalanceReader {
  return {
    async read({ network, address, token }) {
      const wanted = token.trim().toLowerCase() || nativeToken;
      const native = wanted === nativeToken;
      const url = new URL(native ? "/v1/evm/balances/native" : "/v1/evm/balances", baseUrl);
      url.searchParams.set("network", network);
      url.searchParams.set("address", address);
      // The ERC-20 endpoint is paginated and does not contain native balances. Filtering
      // by contract avoids mistaking a token on a later page for a zero holding.
      if (!native) url.searchParams.set("contract", wanted);
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 401 || response.status === 403)
        throw new WatchConfigError("The Token API rejected the key");
      if (!response.ok)
        throw new Error(`The Token API answered ${response.status} for ${address} on ${network}`);
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("data" in body) ||
        !Array.isArray(body.data)
      )
        throw new Error("The Token API answered without a data array");
      // A wallet holding none of the token is a zero balance, not a failure: a watcher for
      // "below 1" should fire for an empty wallet rather than log an error every tick. Zero
      // compares the same at any scale, so the unread token's decimals do not matter here.
      if (body.data.length === 0)
        return { raw: BigInt(0), decimals: 18, symbol: "", token: wanted };
      // Only an empty result means zero. Dropping unreadable rows or accepting a result
      // for another contract can turn a provider error into a false threshold crossing.
      if (!body.data.every(isRow)) throw new Error("The Token API answered an invalid balance row");
      const row = body.data.find(
        (entry) =>
          native || (typeof entry.contract === "string" && entry.contract.toLowerCase() === wanted),
      );
      if (!row) throw new Error("The Token API answered without the requested token");
      if (typeof row.amount !== "string" || typeof row.decimals !== "number")
        throw new Error("The Token API answered a balance without an amount and decimals");
      validateDecimals(row.decimals);
      if (!/^\d+$/.test(row.amount)) throw new Error("The Token API answered an invalid balance");
      if (row.symbol != null && typeof row.symbol !== "string")
        throw new Error("The Token API answered an invalid token symbol");
      return {
        raw: BigInt(row.amount),
        decimals: row.decimals,
        symbol: row.symbol ?? "",
        token: wanted,
      };
    },
  };
}

/** The watched wallet, validated; the API only serves checksum-shaped addresses. */
export function parseWatchedAddress(text: string): string {
  const trimmed = text.trim();
  if (!isAddress(trimmed))
    throw new WatchConfigError(`The watched address is not valid: ${trimmed || "(blank)"}`);
  return trimmed;
}

/** The token the trigger watches: an ERC-20 address, or `native`. */
export function parseWatchedToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === nativeToken) return nativeToken;
  if (!isAddress(trimmed)) throw new WatchConfigError(`The token address is not valid: ${trimmed}`);
  return trimmed.toLowerCase();
}

export function balancePayload(
  config: { network: string; comparison: BalanceTriggerPayload["comparison"]; threshold: string },
  address: string,
  reading: BalanceReading,
): BalanceTriggerPayload {
  return {
    address,
    network: config.network,
    token: reading.token,
    symbol: reading.symbol,
    balance: formatDecimal(reading),
    threshold: config.threshold.trim(),
    comparison: config.comparison,
    decimals: reading.decimals,
  };
}

export function parseBalanceConfig(config: unknown) {
  return parseNodeConfig(balanceTriggerConfigSchema, config);
}
