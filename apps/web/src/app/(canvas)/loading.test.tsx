import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import CanvasLoading from "./loading";

test("the loading state announces itself and draws the builder's chrome", () => {
  const html = renderToString(<CanvasLoading />);
  expect(html).toContain("Loading flow");
  expect(html).toContain('data-side="left"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("bg-canvas");
});
