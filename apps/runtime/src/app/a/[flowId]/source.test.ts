/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { resolveRuntimeSource } from "./source";

describe("resolveRuntimeSource", () => {
  test("a published flow plays through API sessions", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: true })).toBe("session");
  });

  test("an unpublished or unknown flow plays the URL fragment", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: false })).toBe("fragment");
    expect(resolveRuntimeSource({ hasPreviewFlag: false, published: null })).toBe("fragment");
  });

  test("the preview flag always plays the fragment, even for a published flow", () => {
    expect(resolveRuntimeSource({ hasPreviewFlag: true, published: true })).toBe("fragment");
  });
});
