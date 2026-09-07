import { AuthApiError, request } from "@automator/api-client/server";
import { unpublishListingContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

/** Removes the caller's listing for the browser, forwarding its bearer token. */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { slug } = await params;
  try {
    const result = await request(process.env.API_URL, unpublishListingContract, {
      token,
      params: { slug },
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
