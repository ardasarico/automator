import { expect, test } from "bun:test";
import { formatDuration } from "./run-history";

test.each([
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:00:01.250Z", "1.3s"],
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:00:12.400Z", "12s"],
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:01:05.000Z", "1m 05s"],
  ["2026-09-07T10:00:01.000Z", "2026-09-07T10:00:00.000Z", "0.0s"],
])("formatDuration(%s, %s) = %s", (started, finished, expected) => {
  expect(formatDuration(started, finished)).toBe(expected);
});
