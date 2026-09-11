/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "../../not-found";
import Loading from "./loading";
import { PreviewMiniApp } from "./preview-mini-app";
import { NotFoundNotice } from "./shell";

describe("mini-app frames", () => {
  test("a slow API still paints the app frame with a waiting note", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading this app…");
  });

  test("the host's not-found page is the same notice a missing app shows", () => {
    const shared = renderToStaticMarkup(<NotFoundNotice />);
    expect(shared).toContain("App not found");
    expect(renderToStaticMarkup(<NotFound />)).toBe(shared);
  });

  test("a preview says it is waiting for the builder instead of showing nothing", () => {
    const html = renderToStaticMarkup(<PreviewMiniApp flowId="f" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Waiting for the builder…");
  });
});
