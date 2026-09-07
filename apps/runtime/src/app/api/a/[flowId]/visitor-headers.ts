/**
 * The visitor's address for the API's per-address session limit: the runtime is the only
 * caller the private API sees, so it forwards the `X-Forwarded-For` Railway's proxy set on
 * the visitor's request as is (the API reads the first entry). Nothing without one.
 */
export function visitorHeaders(request: Request): Record<string, string> {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor ? { "X-Forwarded-For": forwardedFor } : {};
}
