import { healthContract, parseHealthResponse } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createApp } from "./app";

describe("health checks", () => {
  test.each(["up", "down", "not_configured"] as const)(
    "reports database %s with the correct readiness status",
    async (databaseStatus) => {
      const app = createApp({ check: async () => databaseStatus });
      const response = await app.handle(
        new Request(new URL(healthContract.path, "http://localhost").href),
      );
      expect(response.status).toBe(databaseStatus === "up" ? 200 : 503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body: unknown = await response.json();
      expect(parseHealthResponse(response.status, body)).toMatchObject({
        status: databaseStatus === "up" ? "ok" : "error",
        checks: { api: "up", database: databaseStatus },
      });
    },
  );

  test("liveness does not query the database", async () => {
    const app = createApp({
      check: () => {
        throw new Error("Must not query");
      },
    });
    const response = await app.handle(new Request("http://localhost/health/live"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
