import { request } from "@automator/api-client/server";
import { startMiniAppSessionContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { visitorHeaders } from "../visitor-headers";

/** Opens a session on a published flow; the private API runs it as the flow's owner. */
export async function POST(req: Request, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  try {
    const result = await request(process.env.API_URL, startMiniAppSessionContract, {
      params: { id: flowId },
      headers: visitorHeaders(req),
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
