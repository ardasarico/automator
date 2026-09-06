import {
  parseAuthError,
  parseAuthResponse,
  type AuthContract,
  type AuthResponse,
  type ProfileInput,
} from "@automator/contracts";

export class AuthRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function authRequest<C extends AuthContract>(
  contract: C,
  token: string | null,
  body?: ProfileInput,
): Promise<AuthResponse<C>> {
  if (!token) throw new AuthRequestError("unauthorized");
  const response = await fetch(`/api${contract.path}`, {
    method: contract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new AuthRequestError(parseAuthError(data).error);
  return parseAuthResponse(contract, data);
}
