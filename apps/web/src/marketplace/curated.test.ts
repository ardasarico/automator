import { reservedListingSlugs } from "@automator/contracts";
import { expect, test } from "bun:test";
import { curatedListings } from "./curated";

test("every curated example slug is reserved so the API never mints it", () => {
  for (const item of curatedListings) expect(reservedListingSlugs.has(item.slug)).toBe(true);
});
