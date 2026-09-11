import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import RecordPanelLoading from "./loading";

test("the record panel keeps its frame while the record is read", () => {
  const html = renderToString(<RecordPanelLoading />);
  expect(html).toContain('aria-label="Record details"');
  expect(html).toContain('aria-busy="true"');
});
