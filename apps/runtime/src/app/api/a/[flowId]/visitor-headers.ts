/* Forward Railway's visitor address: the private API otherwise sees only the runtime server. */
export function visitorHeaders(request: Request): Record<string, string> {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor ? { "X-Forwarded-For": forwardedFor } : {};
}
