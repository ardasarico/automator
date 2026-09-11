import { NodeExecutionError } from "./executor";

/*
 * What every node that talks to a provider over HTTP shares: a ceiling on how long one call may
 * take, and one wording for a call that never came back. Chain calls have their own in
 * `onchain-executors`; this is for the webhook and REST providers.
 */

/** How long one provider call may take. A run's own signal still cancels sooner. */
export const providerTimeoutMs = 20_000;

/** The timeout, combined with the run's signal when the caller holds one. */
export function providerSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(providerTimeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** A secret placeholder the resolver could not fill in, left in the config as written. */
const unresolvedSecret = /\{\{\s*secrets\./;

export function requireResolved(value: string, what: string): string {
  if (unresolvedSecret.test(value))
    throw new NodeExecutionError(`${what} references a secret that is not available here`);
  return value;
}

/**
 * Runs one provider call so a transport failure reads as the node's own sentence ("Could not
 * reach Telegram: …") rather than the runtime's "TypeError: fetch failed". A cancelled run
 * passes through untouched, so the engine still reports it as cancelled.
 */
export async function reach<T>(provider: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof NodeExecutionError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new NodeExecutionError(`Could not reach ${provider}: ${describeTransportError(error)}`);
  }
}

function describeTransportError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "the request timed out";
    // Bun and Node wrap the socket error as the cause of a generic "fetch failed".
    const cause = error.cause instanceof Error ? error.cause.message : "";
    return cause || error.message || error.name;
  }
  return String(error);
}
