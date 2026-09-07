import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { formatRunTime, LocalTime } from "./local-time";

test("run timestamps follow the requested zone across midnight and label it", () => {
  const value = "2026-09-07T22:15:00.000Z";
  expect(formatRunTime(value, "Europe/Istanbul")).toMatch(/Sep 8.*1:15 AM GMT\+3/);
  expect(formatRunTime(value, "UTC")).toMatch(/Sep 7.*10:15 PM UTC/);
});

test("server markup is deterministic UTC and preserves the original instant", () => {
  const value = "2026-09-07T22:15:00.000Z";
  expect(renderToString(<LocalTime value={value} />)).toBe(
    `<time dateTime="${value}">${formatRunTime(value, "UTC")}</time>`,
  );
});
