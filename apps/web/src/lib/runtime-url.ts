/* Public URL of the runtime app; inlined at build time, so it cannot be read dynamically. */
export const runtimeUrl = process.env.NEXT_PUBLIC_RUNTIME_URL ?? "http://localhost:3002";

export function miniAppUrl(flowId: string): string {
  return `${runtimeUrl.replace(/\/+$/, "")}/a/${encodeURIComponent(flowId)}`;
}
