/**
 * The visitor only ever sees "unavailable"; the cause goes to the server log, with the abort and
 * timeout cases named since a visitor who left is not an outage.
 */
export function logProxyFailure(phase: "start" | "answer", flowId: string, error: unknown) {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  const name = cause instanceof Error ? cause.name : "";
  const outcome =
    name === "TimeoutError" ? "timed out" : name === "AbortError" ? "aborted" : "failed";
  const detail = cause instanceof Error ? cause.message : String(cause);
  console.error(`Mini-app session ${phase} for flow ${flowId} ${outcome}: ${detail}`);
}
