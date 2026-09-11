import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import CanvasError from "./error";

test("a failed flow load offers a retry and the way back to flows", () => {
  const html = renderToString(<CanvasError error={new Error("boom")} reset={() => {}} />);
  expect(html).toContain("This flow could not be loaded");
  expect(html).toContain("Try again");
  expect(html).toContain('href="/flows"');
});
