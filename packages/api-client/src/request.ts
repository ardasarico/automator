import {
  buildPath,
  parseResponse,
  type ContractBody,
  type ContractParams,
  type ContractResult,
  type EndpointContract,
} from "@automator/contracts";

/**
 * Next.js reads `cache` off the init to opt out of its own fetch cache, but the
 * ambient `RequestInit` this workspace compiles against does not declare it.
 */
export type ApiRequestInit = RequestInit & { cache?: "no-store" };
export type Fetcher = (url: URL, init: ApiRequestInit) => Promise<Response>;

/** Raised when the API could not be reached at all: no URL, network failure or timeout. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface RequestOptions<C extends EndpointContract> {
  /** Bearer token forwarded to the API. Omitted for public endpoints. */
  token?: string;
  params?: ContractParams<C>;
  /** Query-string entries; `undefined` values are skipped. */
  query?: Record<string, string | undefined>;
  body?: ContractBody<C>;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

/**
 * Performs one contract-described call and validates the answer against that
 * contract. Any status the contract declares comes back as data; anything else
 * throws, so callers never see an unvalidated payload.
 */
export async function request<C extends EndpointContract>(
  apiUrl: string | undefined,
  contract: C,
  options: RequestOptions<C> = {},
): Promise<ContractResult<C>> {
  if (!apiUrl) throw new ApiRequestError("API URL is not configured");
  const { token, params, query, body, signal, timeoutMs = 5000, fetcher = fetch } = options;
  const url = new URL(buildPath(contract, params), apiUrl);
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined) url.searchParams.set(key, value);

  const init: ApiRequestInit = {
    method: contract.method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    // A caller's signal never replaces the timeout: whichever fires first wins.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  };

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, init);
    payload = await response.json();
  } catch (error) {
    throw new ApiRequestError(`${contract.method} ${contract.path} did not answer`, error);
  }
  return parseResponse(contract, response.status, payload);
}
