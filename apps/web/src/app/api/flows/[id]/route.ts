import { AuthApiError, request } from "@automator/api-client/server";
import {
  deleteFlowContract,
  isFlowDocumentInput,
  isFlowPatch,
  patchFlowContract,
  updateFlowContract,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

/** Saves one flow for the browser, forwarding its bearer token to the private API. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  // Refused here before the round trip; the API applies the same check and the referential ones.
  if (!isFlowDocumentInput(body))
    return authErrorResponse(req, new AuthApiError(422, "invalid_flow"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, updateFlowContract, {
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

/** Deletes one flow for the browser; the API removes its listing and runs with it. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, deleteFlowContract, {
      token,
      params: { id },
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}

/** Turns the flow's webhook and schedule triggers on or off; the API answers the record. */
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
  if (!isFlowPatch(body)) return authErrorResponse(req, new AuthApiError(422, "invalid_flow"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, patchFlowContract, {
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
