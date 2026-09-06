import { AuthApiError } from "@automator/api-client/server";
import { NextResponse } from "next/server";

export function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function authErrorResponse(error: unknown) {
  const failure = error instanceof AuthApiError ? error : new AuthApiError(503, "unavailable");
  return NextResponse.json(
    { error: failure.code },
    { status: failure.status, headers: { "Cache-Control": "no-store" } },
  );
}
