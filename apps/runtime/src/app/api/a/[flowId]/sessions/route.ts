import { request } from "@automator/api-client/server";
import { startMiniAppSessionContract } from "@automator/contracts";
import { NextResponse } from "next/server";
import { logProxyFailure } from "../proxy-failure";
import { visitorHeaders } from "../visitor-headers";

export async function POST(req: Request, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  try {
    const result = await request(process.env.API_URL, startMiniAppSessionContract, {
      params: { id: flowId },
      headers: visitorHeaders(req),
      signal: req.signal,
      timeoutMs: 65_000,
    });
    return NextResponse.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logProxyFailure("start", flowId, error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
