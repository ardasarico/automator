"use client";

import {
  deleteSecretContract,
  listSecretsContract,
  parseAuthError,
  parseResponse,
  putSecretContract,
  type SecretSummary,
} from "@automator/contracts";
import { createStore, useStore } from "zustand";

/**
 * The signed-in user's secret names, shared by the Variables panel and the node settings
 * picker. Loaded once per page through the same-origin proxy; mutations update the list in
 * place. Values never reach the browser after they are typed.
 */
export type SecretsStatus = "idle" | "loading" | "ready" | "failed";

type SecretsState = {
  status: SecretsStatus;
  secrets: SecretSummary[];
  error: string | null;
  load(token: string | null): Promise<void>;
  save(token: string | null, name: string, value: string): Promise<void>;
  remove(token: string | null, name: string): Promise<void>;
};

export class SecretRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SecretRequestError";
  }
}

const messages: Record<string, string> = {
  unauthorized: "Sign in again to manage secrets.",
  invalid_request: "Use lowercase letters, digits and underscores, and a non-empty value.",
  unavailable: "Secrets are unavailable right now. Try again shortly.",
};

async function call(token: string | null, path: string, init: RequestInit = {}) {
  if (!token) throw new SecretRequestError("unauthorized");
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new SecretRequestError(parseAuthError(data).error);
  return { status: response.status, data };
}

export const secretsStore = createStore<SecretsState>((set, get) => ({
  status: "idle",
  secrets: [],
  error: null,

  async load(token) {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const { status, data } = await call(token, listSecretsContract.path);
      const result = parseResponse(listSecretsContract, status, data);
      if (result.status !== 200) throw new SecretRequestError(result.data.error);
      set({ status: "ready", secrets: result.data.secrets });
    } catch (caught) {
      const code = caught instanceof SecretRequestError ? caught.code : "unavailable";
      set({ status: "failed", error: messages[code] ?? messages.unavailable! });
    }
  },

  async save(token, name, value) {
    const { status, data } = await call(token, `/secrets/${encodeURIComponent(name)}`, {
      method: putSecretContract.method,
      body: JSON.stringify({ value }),
    });
    const result = parseResponse(putSecretContract, status, data);
    if (result.status !== 200) throw new SecretRequestError(result.data.error);
    const saved = result.data;
    set((state) => ({
      secrets: [...state.secrets.filter((s) => s.name !== saved.name), saved].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  },

  async remove(token, name) {
    const { status, data } = await call(token, `/secrets/${encodeURIComponent(name)}`, {
      method: deleteSecretContract.method,
    });
    const result = parseResponse(deleteSecretContract, status, data);
    if (result.status !== 200) throw new SecretRequestError(result.data.error);
    set((state) => ({ secrets: state.secrets.filter((s) => s.name !== name) }));
  },
}));

export function useSecrets<T>(selector: (state: SecretsState) => T): T {
  return useStore(secretsStore, selector);
}

/** A message for the user from a failed save or delete. */
export function describeSecretError(caught: unknown): string {
  const code = caught instanceof SecretRequestError ? caught.code : "unavailable";
  return messages[code] ?? messages.unavailable!;
}
