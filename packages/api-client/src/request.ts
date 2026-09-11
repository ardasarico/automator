import {
  buildPath,
  parseResponse,
  type ContractBody,
  type ContractParams,
  type ContractResult,
  type EndpointContract,
} from "@automator/contracts";

/* Next reads cache from RequestInit, but Bun's ambient type omits it. */
export type ApiRequestInit = RequestInit & { cache?: "no-store" };
export type Fetcher = (url: URL, init: ApiRequestInit) => Promise<Response>;

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
  token?: string;
  params?: ContractParams<C>;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  body?: ContractBody<C>;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

export async function request<C extends EndpointContract>(
  apiUrl: string | undefined,
  contract: C,
  options: RequestOptions<C> = {},
): Promise<ContractResult<C>> {
  if (!apiUrl) throw new ApiRequestError("API URL is not configured");
  const {
    token,
    params,
    query,
    headers,
    body,
    signal,
    timeoutMs = 5000,
    fetcher = fetch,
  } = options;
  const url = new URL(buildPath(contract, params), apiUrl);
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined) url.searchParams.set(key, value);

  const requestHeaders = new Headers(headers);
  // Fetch combines differently cased record keys, so overrides must be case-insensitive.
  requestHeaders.delete("Authorization");
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");

  const init: ApiRequestInit = {
    method: contract.method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  };

  const endpoint = `${contract.method} ${contract.path}`;
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    // A DNS failure, a refused connection, the timeout or the caller's abort: nothing answered.
    throw new ApiRequestError(`Could not reach ${endpoint}: ${describeCause(error)}`, error);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // Something answered, but not the API: a proxy's HTML page, or an empty body.
    throw new ApiRequestError(`${endpoint} answered ${response.status} without a JSON body`, error);
  }
  return parseResponse(contract, response.status, payload);
}

/** The failure in the words the runtime gave, so a log line says which of the causes it was. */
function describeCause(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "the request timed out";
    if (error.name === "AbortError") return "the request was aborted";
    return error.message || error.name;
  }
  return String(error);
}
