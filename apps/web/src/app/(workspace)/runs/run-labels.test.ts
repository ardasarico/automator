import { expect, test } from "bun:test";
import { formatDuration, nodeStatusLabels, runSourceLabels, runStatusLabels } from "./run-labels";

test.each([
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:00:01.250Z", "1.3s"],
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:00:12.400Z", "12s"],
  ["2026-09-07T10:00:00.000Z", "2026-09-07T10:01:05.000Z", "1m 05s"],
  ["2026-09-07T10:00:01.000Z", "2026-09-07T10:00:00.000Z", "0.0s"],
])("formatDuration(%s, %s) = %s", (started, finished, expected) => {
  expect(formatDuration(started, finished)).toBe(expected);
});

test("run and node statuses share their words and badge variants", () => {
  expect(runStatusLabels.failed).toEqual({ label: "Failed", variant: "error" });
  expect(nodeStatusLabels.failed).toEqual(runStatusLabels.failed);
  expect(nodeStatusLabels.succeeded).toEqual(runStatusLabels.succeeded);
  expect(nodeStatusLabels.waiting).toEqual(runStatusLabels.waiting);
  expect(nodeStatusLabels.skipped).toEqual({ label: "Skipped", variant: "secondary" });
});

test("every run source has a label", () => {
  expect(Object.keys(runSourceLabels).sort()).toEqual(
    ["event", "manual", "miniapp", "schedule", "webhook"].sort(),
  );
  expect(runSourceLabels.manual).toBe("Simulate");
});
