import { AuthApiError, request } from "@automator/api-client/server";
import { generateFlowContract, Value } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

/** Generates or edits a flow for the browser, forwarding its bearer token to the private API. */
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
  if (!Value.Check(generateFlowContract.body, body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    // Two model turns at most, so the budget covers a slow model and one retry.
    const result = await request(process.env.API_URL, generateFlowContract, {
      token,
      body,
      timeoutMs: 120_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
