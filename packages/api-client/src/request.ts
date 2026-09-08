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
