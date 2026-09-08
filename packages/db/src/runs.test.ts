import { describe, expect, test } from "bun:test";
import { decodeRunCursor, encodeRunCursor, RunCursorError } from "./runs";

describe("run cursors", () => {
  test("round-trips the exact timestamp and tie-breaking id", () => {
    const cursor = { startedAt: "2026-09-08T12:34:56.789Z", id: "run-1" };
    expect(decodeRunCursor(encodeRunCursor(cursor))).toEqual(cursor);
  });

  test.each(["0", "2026-02-30T00:00:00.000Z", "2026-09-08", "not a date"])(
    "rejects a timestamp outside the store's cursor format: %s",
    (startedAt) => {
      expect(() => decodeRunCursor(encodeRunCursor({ startedAt, id: "run-1" }))).toThrow(
        RunCursorError,
      );
    },
  );
});
