import { AuthApiError, request } from "@automator/api-client/server";
import {
  createApiKeyContract,
  isCreateApiKeyInput,
  listApiKeysContract,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../auth/http";

export async function GET(req: Request) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  try {
    const result = await request(process.env.API_URL, listApiKeysContract, { token });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}

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
  if (!isCreateApiKeyInput(body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, createApiKeyContract, { token, body });
    if (result.status !== 201)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    // The plaintext key passes through here once and is not stored or logged on the way.
    return NextResponse.json(result.data, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
