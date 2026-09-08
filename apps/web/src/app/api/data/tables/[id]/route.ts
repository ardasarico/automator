import { AuthApiError, request } from "@automator/api-client/server";
import {
  deleteDataTableContract,
  getDataTableContract,
  isDataTableInput,
  updateDataTableContract,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../auth/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, getDataTableContract, {
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  if (!isDataTableInput(body))
    return authErrorResponse(req, new AuthApiError(422, "invalid_table"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, updateDataTableContract, {
      token,
      params: { id },
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  // The API refuses a table flows still use until the caller repeats the request with `confirm`.
  const confirm = new URL(req.url).searchParams.get("confirm") ?? undefined;
  try {
    const result = await request(process.env.API_URL, deleteDataTableContract, {
      token,
      params: { id },
      query: { confirm },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
