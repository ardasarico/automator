import { AuthApiError, request } from "@automator/api-client/server";
import { getFlowListingContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../auth/http";

/** The caller's listing for one of their flows, so the builder can offer update or unpublish. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, getFlowListingContract, {
      token,
      params: { id },
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
