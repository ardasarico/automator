import { AuthApiError } from "@automator/api-client/server";
import { NextResponse } from "next/server";

export function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
}

/**
 * These routes exist only for our own pages. Browsers send `Origin` on every
 * request that can change state, so a missing one there is treated as foreign;
 * safe methods, which browsers may send without it, are unaffected.
 */
export function isSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  // A trusted proxy supplies the public host and protocol of the final hop.
  const forwardedHosts = request.headers.get("x-forwarded-host")?.split(",");
  const forwarded = forwardedHosts?.[forwardedHosts.length - 1]?.trim();
  const forwardedProtocols = request.headers.get("x-forwarded-proto")?.split(",");
  const protocol = forwardedProtocols?.[forwardedProtocols.length - 1]?.trim();
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return (
      originUrl.host === (forwarded || requestUrl.host) &&
      originUrl.protocol === (protocol ? `${protocol}:` : requestUrl.protocol)
    );
  } catch {
    return false;
  }
}

export function authErrorResponse(request: Request, error: unknown) {
  const failure = error instanceof AuthApiError ? error : new AuthApiError(503, "unavailable");
  // Diagnostics only: never log tokens, headers or request bodies.
  console.warn(
    `Auth proxy failed ${JSON.stringify({
      path: new URL(request.url).pathname,
      status: failure.status,
      code: failure.code,
    })}`,
  );
  return NextResponse.json(
    { error: failure.code },
    { status: failure.status, headers: { "Cache-Control": "no-store" } },
  );
}
