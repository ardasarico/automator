import { ApiRequestError } from "@automator/api-client/server";
import { webhookTriggerContract, buildPath } from "@automator/contracts";
import { NextResponse } from "next/server";

/* Public webhooks intentionally skip session/origin checks: the path token authorizes execution. */
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
  // Connection can name additional headers that apply only to the incoming connection.
  const connectionHeaders = (headers.get("connection") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name));
  // Fetch frames the buffered body itself; incoming transport and session headers stay here.
  for (const name of [
    ...connectionHeaders,
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "keep-alive",
    "te",
    "trailer",
    "upgrade",
    "expect",
    "proxy-connection",
    "proxy-authenticate",
    "proxy-authorization",
    "cookie",
    "authorization",
  ])
    headers.delete(name);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: await req.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });
    const responseHeaders = new Headers({
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    });
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter !== null) responseHeaders.set("Retry-After", retryAfter);
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: responseHeaders,
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
