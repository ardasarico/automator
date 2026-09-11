import { describe, expect, expectTypeOf, test } from "bun:test";
import { parseResponse } from "./contract";
import { healthContract, type DatabaseStatus, type HealthResponse } from "./health";

const checkedAt = "2026-09-05T00:00:00.000Z";

describe("health response contract", () => {
  test("accepts the success response", () => {
    const body = {
      status: "ok",
      checks: { api: "up", database: "up" },
      checkedAt,
    } satisfies HealthResponse;
    expect(parseResponse(healthContract, 200, body)).toEqual({ status: 200, data: body });
  });

  test.each(["down", "not_configured"] as const)(
    "accepts database %s with HTTP 503",
    (database) => {
      const body = {
        status: "error",
        checks: { api: "up", database },
        checkedAt,
      } satisfies HealthResponse;
      expect(parseResponse(healthContract, 503, body)).toEqual({ status: 503, data: body });
    },
  );

  test.each([
    [200, { status: "ok", checks: { api: "up", database: "down" }, checkedAt }],
    [503, { status: "error", checks: { api: "up", database: "up" }, checkedAt }],
    [503, { status: "error", checks: { api: "up", database: "unknown" }, checkedAt }],
    [200, { status: "ok", checks: { api: "up", database: "up" }, checkedAt: 42 }],
    [200, { status: "ok" }],
    [503, { status: "ok", checks: { api: "up", database: "up" }, checkedAt }],
    [500, { status: "ok", checks: { api: "up", database: "up" }, checkedAt }],
  ] as const)("rejects a mismatched HTTP status or payload (%s)", (status, body) => {
    expect(() => parseResponse(healthContract, status, body)).toThrow();
  });

  test("reads the shared error statuses instead of throwing on them", () => {
    expect(parseResponse(healthContract, 500, { error: "unavailable" })).toEqual({
      status: 500,
      data: { error: "unavailable" },
    });
    expect(parseResponse(healthContract, 429, { error: "rate_limited" })).toEqual({
      status: 429,
      data: { error: "rate_limited" },
    });
    // The health-specific 503 shape still wins for that status.
    expect(() => parseResponse(healthContract, 503, { error: "unavailable" })).toThrow();
  });

  test("derives correlated TypeScript types from the schemas", () => {
    expectTypeOf<
      Extract<HealthResponse, { status: "ok" }>["checks"]["database"]
    >().toEqualTypeOf<"up">();
    expectTypeOf<
      Extract<HealthResponse, { status: "error" }>["checks"]["database"]
    >().toEqualTypeOf<Exclude<DatabaseStatus, "up">>();
  });
});
