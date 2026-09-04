import { describe, expect, expectTypeOf, test } from "bun:test";
import { parseHealthResponse, type DatabaseStatus, type HealthResponse } from ".";

const checkedAt = "2026-09-05T00:00:00.000Z";

describe("health response contract", () => {
  test("accepts the success response", () => {
    const body = {
      status: "ok",
      checks: { api: "up", database: "up" },
      checkedAt,
    } satisfies HealthResponse;
    expect(parseHealthResponse(200, body)).toEqual(body);
  });

  test.each(["down", "not_configured"] as const)(
    "accepts database %s with HTTP 503",
    (database) => {
      const body = {
        status: "error",
        checks: { api: "up", database },
        checkedAt,
      } satisfies HealthResponse;
      expect(parseHealthResponse(503, body)).toEqual(body);
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
    expect(() => parseHealthResponse(status, body)).toThrow();
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
