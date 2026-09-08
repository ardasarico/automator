import { request } from "@automator/api-client/server";
import { answerMiniAppSessionContract, miniAppAnswerSchema, Value } from "@automator/contracts";
import { NextResponse } from "next/server";
import { visitorHeaders } from "../../../visitor-headers";

/** Forwards a visitor's answer to the private API and hands back the next screen. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ flowId: string; sessionId: string }> },
) {
  const { flowId, sessionId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!Value.Check(miniAppAnswerSchema, body))
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const result = await request(process.env.API_URL, answerMiniAppSessionContract, {
      params: { id: flowId, sessionId },
      headers: visitorHeaders(req),
      body,
      signal: req.signal,
      timeoutMs: 65_000,
    });
    return NextResponse.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
