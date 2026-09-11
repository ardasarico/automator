import { healthContract } from "@automator/contracts";
import { request, type Fetcher } from "./request";

export async function getHealth(apiUrl: string | undefined, fetcher: Fetcher = fetch) {
  if (!apiUrl) return { backend: "not_configured", database: "unknown" } as const;
  try {
    const result = await request(apiUrl, healthContract, { fetcher });
    // A shared error status (a 500, a rate limit) means the API answered but not with a check.
    if (result.status !== 200 && result.status !== 503)
      return { backend: "down", database: "unknown" } as const;
    return { backend: "up", database: result.data.checks.database } as const;
  } catch {
    return { backend: "down", database: "unknown" } as const;
  }
}
