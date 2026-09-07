import { AuthApiError, request } from "@automator/api-client/server";
import {
  deleteSecretContract,
  isSecretName,
  putSecretContract,
  secretValueInputSchema,
  Value,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

type Params = { params: Promise<{ name: string }> };

/** Creates or replaces one secret. The value goes straight to the API and is never logged. */
export async function PUT(req: Request, { params }: Params) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { name } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  if (!isSecretName(name) || !Value.Check(secretValueInputSchema, body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, putSecretContract, {
      token,
      params: { name },
      body,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { name } = await params;
  if (!isSecretName(name)) return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, deleteSecretContract, {
      token,
      params: { name },
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
