/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { metadata, viewport } from "./layout";

const manifest = JSON.parse(
  await Bun.file(new URL("../../public/meta/site.webmanifest", import.meta.url)).text(),
) as Record<string, string>;

describe("runtime document metadata", () => {
  test("describes the host and shares the same description on Open Graph", () => {
    expect(metadata.description).toBeTruthy();
    expect(metadata.openGraph).toMatchObject({
      siteName: "Automator",
      title: "Automator Apps",
      description: metadata.description,
    });
    const images = metadata.openGraph?.images;
    expect(JSON.stringify(images)).toContain("/meta/");
  });

  test("paints the browser chrome in each scheme's page background", () => {
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#fbfcfc" },
      { media: "(prefers-color-scheme: dark)", color: "#0b0e0f" },
    ]);
  });

  test("the manifest names the same light background for the splash and chrome", () => {
    expect(manifest.theme_color).toBe("#fbfcfc");
    expect(manifest.background_color).toBe("#fbfcfc");
  });
});
