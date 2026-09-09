import { describe, expect, test } from "bun:test";
import { relativeTime } from "./relative-time";

const now = Date.parse("2026-09-09T12:00:00.000Z");

function ago(ms: number) {
  return relativeTime(new Date(now - ms).toISOString(), now);
}

describe("relativeTime", () => {
  test("calls the last half minute now", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(30_000)).toBe("just now");
  });

  test("counts in the shortest unit that still says it", () => {
    expect(ago(4 * 60_000)).toBe("4m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(86_400_000)).toBe("1d ago");
    expect(ago(3 * 604_800_000)).toBe("3w ago");
    expect(ago(400 * 86_400_000)).toBe("1y ago");
  });

  test("says nothing for a stamp it cannot read", () => {
    expect(relativeTime("not a date", now)).toBe("");
  });
});
