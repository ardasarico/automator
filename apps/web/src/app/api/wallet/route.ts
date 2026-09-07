import { AuthApiError, request } from "@automator/api-client/server";
import { getWalletContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../auth/http";

/** The signed-in user's wallet balances on one chain, for the builder; forwards `?chainId=`. */
export async function GET(req: Request) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const chainId = new URL(req.url).searchParams.get("chainId") ?? undefined;
  try {
    const result = await request(process.env.API_URL, getWalletContract, {
      token,
      query: { chainId },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
