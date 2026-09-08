/** Calls per minute a caller may make before the API answers 429 `rate_limited`. */
export interface RateLimits {
  /** `POST /flows/run` and `POST /flows/:id/runs`, per user. */
  runs: number;
  /** Every `/ai/*` route, per user. */
  ai: number;
  /** `PUT /secrets/:name`, per user. */
  secrets: number;
  /** The public mini-app session routes, per client address. */
  sessions: number;
  /** The public webhook route, per flow. */
  webhooks: number;
}

export const defaultRateLimits: RateLimits = {
  runs: 30,
  ai: 10,
  secrets: 30,
  sessions: 60,
  webhooks: 60,
};

const windowMs = 60_000;

export interface RateLimiter {
  /** Records a call and says whether it is within the limit; refusals are not recorded. */
  allow(key: string): boolean;
  /** Whole seconds until the key's oldest call leaves the window; at least one. */
  retryAfter(key: string): number;
}

/** A sliding one-minute window per key, in memory: enough for one API instance. */
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

/**
 * The caller's address for a per-client limit: the first entry of `X-Forwarded-For` (Railway's
 * proxy sets it), else the socket address, else a shared bucket for callers without either.
 */
export function clientAddress(
  forwardedFor: string | null | undefined,
  socketAddress: string | null | undefined,
): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return forwarded || socketAddress || "unknown";
}
