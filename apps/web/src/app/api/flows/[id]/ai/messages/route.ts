import { AuthApiError, request } from "@automator/api-client/server";
import {
  aiRequestTimeoutMs,
  buildPath,
  clearAiMessagesContract,
  listAiMessagesContract,
  parseAuthError,
  sendAiMessageContract,
  Value,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../../../auth/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, listAiMessagesContract, {
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  const { id } = await params;
  try {
    const result = await request(process.env.API_URL, clearAiMessagesContract, {
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

/**
 * The only proxy that streams: the API answers `text/event-stream`, which `request()` cannot
 * relay because it always reads the body as JSON. A plain `fetch` forwards the upstream body
 * untouched instead of buffering it into one response.
 */
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
  if (!Value.Check(sendAiMessageContract.body, body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  const { id } = await params;
  try {
    const upstream = await fetch(
      `${process.env.API_URL}${buildPath(sendAiMessageContract, { id })}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(aiRequestTimeoutMs + 5_000),
      },
    );
    if (!upstream.ok) {
      const data: unknown = await upstream.json().catch(() => ({}));
      return authErrorResponse(req, new AuthApiError(upstream.status, parseAuthError(data).error));
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
