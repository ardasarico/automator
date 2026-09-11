import { describe, expect, test } from "bun:test";
import { getHealth } from "./health";

function respond(body: unknown, status = 200) {
  return async () => Response.json(body, { status });
}

describe("backend health", () => {
  test.each(["up", "down", "not_configured"] as const)(
    "distinguishes a reachable backend from database %s",
    async (database) => {
      const healthy = database === "up";
      const fetcher = respond(
        {
          status: healthy ? "ok" : "error",
          checks: { api: "up", database },
          checkedAt: new Date().toISOString(),
        },
        healthy ? 200 : 503,
      );
      expect(await getHealth("http://localhost:3001", fetcher)).toEqual({
        backend: "up",
        database,
      });
    },
  );

  test("missing configuration does not make a request", async () => {
    const fetcher = async () => {
      throw new Error("Must not fetch");
    };
    expect(await getHealth(undefined, fetcher)).toEqual({
      backend: "not_configured",
      database: "unknown",
    });
  });

  test("a shared error status is a backend that is down, not a crash", async () => {
    expect(
      await getHealth("http://localhost:3001", respond({ error: "unavailable" }, 500)),
    ).toEqual({ backend: "down", database: "unknown" });
  });

  test("connection failure leaves database status unknown", async () => {
    const fetcher = async () => {
      throw new TypeError("Connection refused");
    };
    expect(await getHealth("http://localhost:3001", fetcher)).toEqual({
      backend: "down",
      database: "unknown",
    });
  });

  test("rejects malformed responses", async () => {
    expect(await getHealth("http://localhost:3001", respond({ status: "ok" }))).toEqual({
      backend: "down",
      database: "unknown",
    });
  });

  test("rejects a success payload with an error HTTP status", async () => {
    const fetcher = respond(
      { status: "ok", checks: { api: "up", database: "up" }, checkedAt: "now" },
      500,
    );
    expect(await getHealth("http://localhost:3001", fetcher)).toEqual({
      backend: "down",
      database: "unknown",
    });
  });
});
