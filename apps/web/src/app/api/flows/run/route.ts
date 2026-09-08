import { AuthApiError, request } from "@automator/api-client/server";
import { flowRunRequestSchema, runFlowContract, Value } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

/* Leave time for the engine's per-node waits before the proxy times out. */
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
  if (!Value.Check(flowRunRequestSchema, body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, runFlowContract, {
      token,
      body,
      timeoutMs: 60_000,
      signal: req.signal,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
