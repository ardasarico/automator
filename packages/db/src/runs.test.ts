import { runStatsWindowDays } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  decodeRunCursor,
  encodeRunCursor,
  RunCursorError,
  runStatsMaxDays,
  statsWindowDays,
} from "./runs";

describe("stats window", () => {
  test("clamps a whole number of days to the scanned range", () => {
    expect(statsWindowDays(1)).toBe(1);
    expect(statsWindowDays(14.9)).toBe(14);
    expect(statsWindowDays(0)).toBe(1);
    expect(statsWindowDays(-3)).toBe(1);
    expect(statsWindowDays(500)).toBe(runStatsMaxDays);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, "14", undefined, null])(
    "falls back to the standard window for %p rather than a NaN interval",
    (value) => {
      expect(statsWindowDays(value)).toBe(runStatsWindowDays);
    },
  );
});

describe("run cursors", () => {
  test("round-trips the ordered column's value and the tie-breaking id", () => {
    const cursor = { key: "2026-09-08T12:34:56.789Z", id: "run-1" };
    expect(decodeRunCursor(encodeRunCursor(cursor))).toEqual(cursor);
  });

  /* The key is whatever the ordered column rendered — a name, a status, an interval. */
  test.each(["Ticket checkout", "succeeded", "00:00:02.4"])("carries a %s key", (key) => {
    expect(decodeRunCursor(encodeRunCursor({ key, id: "run-1" }))).toEqual({ key, id: "run-1" });
  });

  test.each(["", "not base64url at all!", "eyJhIjoxfQ"])(
    "rejects an unreadable cursor: %s",
    (value) => {
      expect(() => decodeRunCursor(value)).toThrow(RunCursorError);
    },
  );

  test("rejects a cursor missing either half", () => {
    expect(() => decodeRunCursor(encodeRunCursor({ key: "", id: "run-1" }))).toThrow(
      RunCursorError,
    );
    expect(() => decodeRunCursor(encodeRunCursor({ key: "x", id: "" }))).toThrow(RunCursorError);
  });
});
