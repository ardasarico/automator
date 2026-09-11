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

type SecretsStatus = "idle" | "loading" | "ready" | "failed";

type SecretsState = {
  accountId: string | null;
  status: SecretsStatus;
  secrets: SecretSummary[];
  error: string | null;
  setAccount(accountId: string | null): void;
  load(token: string | null): Promise<void>;
  save(token: string | null, name: string, value: string): Promise<void>;
  remove(token: string | null, name: string): Promise<void>;
};

class SecretRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SecretRequestError";
  }
}

const messages: Record<string, string> = {
  unauthorized: "Sign in again to manage secrets.",
  invalid_secret: "Use lowercase letters, digits and underscores, and a non-empty value.",
  invalid_request: "Use lowercase letters, digits and underscores, and a non-empty value.",
  unavailable: "Secrets are unavailable right now. Try again shortly.",
  rate_limited: "Too many requests. Try again in a moment.",
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

export function createSecretsStore() {
  return createStore<SecretsState>((set, get) => {
    let generation = 0;
    function actions(owner: number): Pick<SecretsState, "load" | "save" | "remove"> {
      const isCurrent = () => owner === generation && get().accountId !== null;
      const assertCurrent = () => {
        if (!isCurrent()) throw new SecretRequestError("unauthorized");
      };
      return {
        async load(token) {
          if (!isCurrent() || get().status === "loading") return;
          set({ status: "loading", error: null });
          try {
            const { status, data } = await call(token, listSecretsContract.path);
            const result = parseResponse(listSecretsContract, status, data);
            if (result.status !== 200) throw new SecretRequestError(result.data.error);
            if (isCurrent()) set({ status: "ready", secrets: result.data.secrets });
          } catch (caught) {
            if (!isCurrent()) return;
            const code = caught instanceof SecretRequestError ? caught.code : "unavailable";
            set({ status: "failed", error: messages[code] ?? messages.unavailable! });
          }
        },

        async save(token, name, value) {
          assertCurrent();
          const { status, data } = await call(token, `/secrets/${encodeURIComponent(name)}`, {
            method: putSecretContract.method,
            body: JSON.stringify({ value }),
          });
          assertCurrent();
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
          assertCurrent();
          const { status, data } = await call(token, `/secrets/${encodeURIComponent(name)}`, {
            method: deleteSecretContract.method,
          });
          assertCurrent();
          const result = parseResponse(deleteSecretContract, status, data);
          if (result.status !== 200) throw new SecretRequestError(result.data.error);
          set((state) => ({ secrets: state.secrets.filter((s) => s.name !== name) }));
        },
      };
    }

    return {
      accountId: null,
      status: "idle",
      secrets: [],
      error: null,
      setAccount(accountId) {
        if (get().accountId === accountId) return;
        generation++;
        // Rotate the actions too: a consumer may still be awaiting the old account's token.
        set({ accountId, status: "idle", secrets: [], error: null, ...actions(generation) });
      },
      ...actions(generation),
    };
  });
}

export const secretsStore = createSecretsStore();

export function useSecrets<T>(selector: (state: SecretsState) => T): T {
  return useStore(secretsStore, selector);
}

export function describeSecretError(caught: unknown): string {
  const code = caught instanceof SecretRequestError ? caught.code : "unavailable";
  return messages[code] ?? messages.unavailable!;
}
