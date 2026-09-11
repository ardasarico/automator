/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroPrompt } from "./prompt";

describe("hero prompt", () => {
  test("cannot be sent while empty, so the app never opens with a blank prompt", () => {
    const html = renderToStaticMarkup(<HeroPrompt />);
    expect(html).toMatch(/<button[^>]*\bdisabled=""/);
  });
});
