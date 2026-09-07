import { ApiRequestError } from "@automator/api-client/server";
import { webhookTriggerContract, buildPath } from "@automator/contracts";
import { NextResponse } from "next/server";

/**
 * The public face of a flow's webhook: the API is private, so callers hit this URL on the
 * web origin and it forwards the request as-is. No session and no origin check on purpose;
 * the token in the path is the credential and the API answers 404 for anything it rejects.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ flowId: string; token: string }> },
) {
  const { flowId, token } = await params;
  const apiUrl = process.env.API_URL;
  if (!apiUrl) return failure(503, "unavailable");
  const target = new URL(buildPath(webhookTriggerContract, { flowId, token }), apiUrl);
  target.search = new URL(req.url).search;
  const headers = new Headers(req.headers);
  // Hop-by-hop and origin-bound headers stay on this side.
  for (const name of ["host", "connection", "content-length", "cookie", "authorization"])
    headers.delete(name);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: await req.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.warn(
      `Webhook proxy failed ${JSON.stringify({ flowId, cause: error instanceof ApiRequestError ? error.message : "fetch" })}`,
    );
    return failure(503, "unavailable");
  }
}

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
