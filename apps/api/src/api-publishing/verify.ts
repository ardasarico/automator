import type { ApiKeyStore } from "@automator/db";
import { hashApiKey } from "./keys";

/**
 * Turns a raw API key into the owner it stands for. The only place a key is resolved, so the
 * machine routes and the MCP transport cannot disagree about what a key means.
 */
export interface ApiKeyVerifier {
  verify(rawKey: string): Promise<{ id: string } | null>;
}

/* How stale "last used" may be. Every call would otherwise write a row on the request path. */
const touchIntervalMs = 60_000;

export function createApiKeyVerifier(
  keys: ApiKeyStore,
  now: () => number = Date.now,
): ApiKeyVerifier {
  const touched = new Map<string, number>();
  return {
    async verify(rawKey) {
      const found = await keys.findOwner(hashApiKey(rawKey));
      if (!found) return null;
      const at = now();
      if (at - (touched.get(found.id) ?? 0) >= touchIntervalMs) {
        touched.set(found.id, at);
        // Not awaited: a lost timestamp costs nothing, a slow write would cost every call.
        void keys.touch(found.id).catch(() => touched.delete(found.id));
      }
      return { id: found.ownerId };
    },
  };
}
