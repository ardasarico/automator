import { healthContract } from "@automator/contracts";
import { request, type Fetcher } from "./request";

export async function getHealth(apiUrl: string | undefined, fetcher: Fetcher = fetch) {
  if (!apiUrl) return { backend: "not_configured", database: "unknown" } as const;
  try {
    const { data } = await request(apiUrl, healthContract, { fetcher });
    return { backend: "up", database: data.checks.database } as const;
  } catch {
    return { backend: "down", database: "unknown" } as const;
  }
}
