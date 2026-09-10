import { AuthApiError, request } from "@automator/api-client/server";
import { revokeApiKeyContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  if (!id) return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, revokeApiKeyContract, {
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
