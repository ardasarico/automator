import { describe, expect, test } from "bun:test";
import { decodeRunCursor, encodeRunCursor, RunCursorError } from "./runs";

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
