import {
  parseAuthError,
  parseAuthResponse,
  type AuthContract,
  type AuthError,
  type AuthResponse,
  type ProfileInput,
} from "@automator/contracts";

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: AuthError["error"],
  ) {
    super(code);
  }
}

export async function requestAuth<C extends AuthContract>(
  apiUrl: string | undefined,
  token: string | undefined,
  contract: C,
  body?: ProfileInput,
  fetcher: (url: URL, init: RequestInit) => Promise<Response> = fetch,
): Promise<AuthResponse<C>> {
  if (!token) throw new AuthApiError(401, "unauthorized");
  if (!apiUrl) throw new AuthApiError(503, "unavailable");
  try {
    const response = await fetcher(new URL(contract.path, apiUrl), {
      method: contract.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const data: unknown = await response.json();
    if (!response.ok) throw new AuthApiError(response.status, parseAuthError(data).error);
    return parseAuthResponse(contract, data);
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    throw new AuthApiError(503, "unavailable");
  }
}
