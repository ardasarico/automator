import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { LocalDate, formatDate } from "./local-date";

test("formatDate writes the short calendar date in the requested zone", () => {
  expect(formatDate("2026-09-09T23:30:00.000Z", "UTC")).toBe("Sep 9, 2026");
  expect(formatDate("2026-09-09T23:30:00.000Z", "Pacific/Auckland")).toBe("Sep 10, 2026");
});

test("the server renders the date in UTC with the exact stamp on the element", () => {
  const html = renderToString(<LocalDate value="2026-09-09T23:30:00.000Z" />);
  expect(html).toContain('dateTime="2026-09-09T23:30:00.000Z"');
  expect(html).toContain("Sep 9, 2026");
});
