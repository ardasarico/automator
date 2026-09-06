import { AuthApiError, requestAuth } from "@automator/api-client/server";
import { isProfileInput, profileContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return authErrorResponse(new AuthApiError(403, "forbidden"));
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return authErrorResponse(new AuthApiError(422, "invalid_profile"));
  }
  if (!isProfileInput(body)) return authErrorResponse(new AuthApiError(422, "invalid_profile"));
  try {
    const profile = await requestAuth(
      process.env.API_URL,
      bearerToken(request),
      profileContract,
      body,
    );
    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
