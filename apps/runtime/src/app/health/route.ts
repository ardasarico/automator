import type { LivenessResponse } from "@automator/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" } satisfies LivenessResponse, {
    headers: { "Cache-Control": "no-store" },
  });
}
