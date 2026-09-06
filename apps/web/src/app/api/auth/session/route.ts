import { AuthApiError, requestAuth } from "@automator/api-client/server";
import { sessionContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";
import { SESSION_COOKIE } from "../../../../auth/server";

/** Read per call so the flag follows the environment the handler runs in. */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  } as const;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return authErrorResponse(request, new AuthApiError(403, "forbidden"));
  const token = bearerToken(request);
  if (!token) return authErrorResponse(request, new AuthApiError(401, "unauthorized"));
  try {
    const session = await requestAuth(process.env.API_URL, token, sessionContract);
    const response = NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, {
      ...cookieOptions(),
      expires: new Date(session.expiresAt * 1000),
    });
    return response;
  } catch (error) {
    return authErrorResponse(request, error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return authErrorResponse(request, new AuthApiError(403, "forbidden"));
  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
