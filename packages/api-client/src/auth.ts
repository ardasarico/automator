import {
  type ApiError,
  type ApiErrorCode,
  type AuthContract,
  type AuthResponse,
  type ProfileInput,
} from "@automator/contracts";
import { request, type Fetcher } from "./request";

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
  ) {
    super(code);
    this.name = "AuthApiError";
  }
}

export async function requestAuth<C extends AuthContract>(
  apiUrl: string | undefined,
  token: string | undefined,
  contract: C,
  body?: ProfileInput,
  fetcher: Fetcher = fetch,
): Promise<AuthResponse<C>> {
  if (!token) throw new AuthApiError(401, "unauthorized");
  if (!apiUrl) throw new AuthApiError(503, "unavailable");
  // The contract union hides the per-status payload behind a generic, so the
  // result is narrowed here rather than by the compiler.
  let result: { status: 200; data: AuthResponse<C> } | { status: number; data: ApiError };
  try {
    result = (await request(apiUrl, contract, {
      token,
      body: body as never,
      timeoutMs: 15_000,
      fetcher,
    })) as typeof result;
  } catch {
    throw new AuthApiError(503, "unavailable");
  }
  if (result.status !== 200) throw new AuthApiError(result.status, (result.data as ApiError).error);
  return result.data as AuthResponse<C>;
}
