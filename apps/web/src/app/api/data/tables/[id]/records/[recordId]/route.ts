import { AuthApiError, request } from "@automator/api-client/server";
import {
  deleteDataRecordContract,
  isDataRecordInput,
  updateDataRecordContract,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../../../auth/http";

type RecordParams = { params: Promise<{ id: string; recordId: string }> };

export async function PATCH(req: Request, { params }: RecordParams) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  if (!isDataRecordInput(body))
    return authErrorResponse(req, new AuthApiError(422, "invalid_record"));
  const { id, recordId } = await params;
  try {
    const result = await request(process.env.API_URL, updateDataRecordContract, {
      token,
      params: { id, recordId },
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

export async function DELETE(req: Request, { params }: RecordParams) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id, recordId } = await params;
  try {
    const result = await request(process.env.API_URL, deleteDataRecordContract, {
      token,
      params: { id, recordId },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
