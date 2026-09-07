import { AuthApiError, request } from "@automator/api-client/server";
import { runSavedFlowContract, runSavedFlowInputSchema, Value } from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../auth/http";

/** Runs the caller's saved flow and records the run; the API executes the stored document. */
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
  if (!Value.Check(runSavedFlowInputSchema, body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, runSavedFlowContract, {
      token,
      params: { id },
      body,
      timeoutMs: 60_000,
      signal: req.signal,
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
