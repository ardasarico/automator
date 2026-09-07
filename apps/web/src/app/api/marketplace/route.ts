import { AuthApiError, request } from "@automator/api-client/server";
import { isPublishListingInput, publishListingContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../auth/http";

/** Publishes one of the caller's flows for the browser, forwarding its bearer token. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  if (!isPublishListingInput(body))
    return authErrorResponse(req, new AuthApiError(422, "invalid_listing"));
  try {
    const result = await request(process.env.API_URL, publishListingContract, {
      token,
      body,
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
