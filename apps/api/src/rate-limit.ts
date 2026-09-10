export interface RateLimits {
  runs: number;
  data: number;
  ai: number;
  secrets: number;
  sessions: number;
  webhooks: number;
  api: number;
}

export const defaultRateLimits: RateLimits = {
  runs: 30,
  data: 30,
  ai: 10,
  secrets: 30,
  sessions: 60,
  webhooks: 60,
  api: 60,
};

const windowMs = 60_000;

export interface RateLimiter {
  allow(key: string): boolean;
  retryAfter(key: string): number;
}

export function createRateLimiter(limit: number, now: () => number = Date.now): RateLimiter {
  const calls = new Map<string, number[]>();
  const recent = (key: string, at: number) => {
    const cutoff = at - windowMs;
    // Entries are ordered by their last accepted call. Clear inactive callers even
    // when they never return, so public traffic cannot leave a bucket behind forever.
    for (const [caller, recorded] of calls) {
      if (recorded[recorded.length - 1]! > cutoff) break;
      calls.delete(caller);
    }
    const kept = (calls.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length === 0) calls.delete(key);
    else calls.set(key, kept);
    return kept;
  };
  return {
    allow(key) {
      const at = now();
      const kept = recent(key, at);
      if (kept.length >= limit) return false;
      kept.push(at);
      calls.delete(key);
      calls.set(key, kept);
      return true;
    },
    retryAfter(key) {
      const at = now();
      const oldest = recent(key, at)[0];
      if (oldest === undefined) return 1;
      return Math.max(1, Math.ceil((oldest + windowMs - at) / 1000));
    },
  };
}

/* Railway supplies the first X-Forwarded-For address; requests without an address share a bucket. */
export function clientAddress(
  forwardedFor: string | null | undefined,
  socketAddress: string | null | undefined,
): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return forwarded || socketAddress || "unknown";
}
