"use client";

import {
  createApiKeyContract,
  parseAuthError,
  parseResponse,
  revokeApiKeyContract,
  type CreatedApiKey,
} from "@automator/contracts";

/*
 * Minting and revoking API keys from the browser. The list itself is rendered on the server, so
 * this only carries the two writes; the created key is returned to the caller and never stored.
 */

class ApiKeyRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ApiKeyRequestError";
  }
}

const messages: Record<string, string> = {
  unauthorized: "Sign in again to manage API keys.",
  invalid_name: "Give the key a name of up to 60 characters.",
  invalid_request: "Give the key a name of up to 60 characters.",
  conflict: "You already hold the maximum number of keys. Revoke one first.",
  not_found: "That key has already been revoked.",
  rate_limited: "Too many requests. Try again in a moment.",
  unavailable: "API keys are unavailable right now. Try again shortly.",
};

export function describeApiKeyError(caught: unknown): string {
  const code = caught instanceof ApiKeyRequestError ? caught.code : "unavailable";
  return messages[code] ?? messages.unavailable!;
}

async function call(token: string | null, path: string, init: RequestInit = {}) {
  if (!token) throw new ApiKeyRequestError("unauthorized");
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new ApiKeyRequestError(parseAuthError(data).error);
  return { status: response.status, data };
}

/** The only moment the key itself exists outside the caller's own machine. */
export async function createApiKey(token: string | null, name: string): Promise<CreatedApiKey> {
  const { status, data } = await call(token, createApiKeyContract.path, {
    method: createApiKeyContract.method,
    body: JSON.stringify({ name }),
  });
  const result = parseResponse(createApiKeyContract, status, data);
  if (result.status !== 201) throw new ApiKeyRequestError(result.data.error);
  return result.data;
}

export async function revokeApiKey(token: string | null, id: string): Promise<void> {
  const { status, data } = await call(token, `/api-keys/${encodeURIComponent(id)}`, {
    method: revokeApiKeyContract.method,
  });
  const result = parseResponse(revokeApiKeyContract, status, data);
  if (result.status !== 200) throw new ApiKeyRequestError(result.data.error);
}
