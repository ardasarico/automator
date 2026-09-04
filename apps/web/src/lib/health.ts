import { healthContract, parseHealthResponse } from "@automator/contracts";

type FetchHealth = (url: URL, init: RequestInit) => Promise<Response>;

export async function getHealth(apiUrl: string | undefined, fetcher: FetchHealth = fetch) {
  if (!apiUrl) return { backend: "not_configured", database: "unknown" } as const;

  try {
    const response = await fetcher(new URL(healthContract.path, apiUrl), {
      method: healthContract.method,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body: unknown = await response.json();
    const health = parseHealthResponse(response.status, body);
    return { backend: "up", database: health.checks.database } as const;
  } catch {
    return { backend: "down", database: "unknown" } as const;
  }
}
