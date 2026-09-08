import { AuthApiError, request } from "@automator/api-client/server";
import {
  createDataRecordContract,
  isDataRecordInput,
  listDataRecordsContract,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../../auth/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  const search = new URL(req.url).searchParams;
  try {
    const result = await request(process.env.API_URL, listDataRecordsContract, {
      token,
      params: { id },
      query: {
        cursor: search.get("cursor") ?? undefined,
        limit: search.get("limit") ?? undefined,
      },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  // The API validates the values against the table's columns; this only checks the envelope.
  if (!isDataRecordInput(body))
    return authErrorResponse(req, new AuthApiError(422, "invalid_record"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, createDataRecordContract, {
      token,
      params: { id },
      body,
      timeoutMs: 15_000,
    });
    if (result.status !== 201)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
