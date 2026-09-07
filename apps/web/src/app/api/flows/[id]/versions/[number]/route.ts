import { AuthApiError, request } from "@automator/api-client/server";
import { getFlowVersionContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../../auth/http";

/** Reads one saved version of the caller's flow, document included, for a restore. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; number: string }> },
) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id, number } = await params;
  try {
    const result = await request(process.env.API_URL, getFlowVersionContract, {
      token,
      params: { id, number },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
