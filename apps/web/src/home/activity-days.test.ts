import { describe, expect, test } from "bun:test";
import { groupByDay } from "./activity-days";

const zone = "America/New_York";
const now = "2026-09-09T15:00:00.000Z";

function row(at: string, id = at) {
  return { id, at };
}

describe("grouping the tape into days", () => {
  test("runs from the same day in the reader's zone share a group", () => {
    const groups = groupByDay([row("2026-09-09T15:00:00.000Z"), row("2026-09-09T12:00:00.000Z")], {
      now,
      timeZone: zone,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(2);
  });

  test("a run just past local midnight belongs to the next day, not the UTC one", () => {
    /* 03:00 UTC is still the previous evening in New York. */
    const groups = groupByDay([row("2026-09-09T03:00:00.000Z"), row("2026-09-09T15:00:00.000Z")], {
      now,
      timeZone: zone,
    });
    expect(groups.map((group) => group.label)).toEqual(["Yesterday", "Today"]);
  });

  test("today and yesterday are named, older days carry their date", () => {
    const groups = groupByDay(
      [
        row("2026-09-09T15:00:00.000Z"),
        row("2026-09-08T15:00:00.000Z"),
        row("2026-09-06T15:00:00.000Z"),
      ],
      { now, timeZone: zone },
    );
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Sep 6"]);
  });

  test("the given order is kept inside and between groups", () => {
    const groups = groupByDay(
      [
        row("2026-09-09T15:00:00.000Z", "a"),
        row("2026-09-09T09:00:00.000Z", "b"),
        row("2026-09-08T15:00:00.000Z", "c"),
      ],
      { now, timeZone: zone },
    );
    expect(groups.map((group) => group.rows.map((entry) => entry.id))).toEqual([["a", "b"], ["c"]]);
  });

  test("nothing to show is no groups at all", () => {
    expect(groupByDay([], { now, timeZone: zone })).toEqual([]);
  });
});
