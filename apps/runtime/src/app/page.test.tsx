/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";

describe("runtime landing page", () => {
  test("explains what a mini-app link is and that nothing is listed here", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Automator Apps");
    expect(html).toContain("What a mini-app link is");
    expect(html).toContain("There is nothing to browse here");
    expect(html).toContain("/a/");
    expect(html).toContain("does not review or endorse it");
  });
});
