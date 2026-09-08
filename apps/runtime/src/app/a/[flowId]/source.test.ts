/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { resolveRuntimeSource } from "./source";

describe("resolveRuntimeSource", () => {
  test("a published flow plays through API sessions", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: true })).toBe("session");
  });

  test("an unpublished or unknown flow without a preview flag is missing", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: false })).toBe("missing");
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: null })).toBe("missing");
  });

  test("the preview flag always requires the builder handoff, even for a published flow", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: true, published: true })).toBe("preview");
  });
});
