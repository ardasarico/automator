import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { decodeDocumentHash, encodeDocumentHash } from "./document-hash";

const document: FlowDocument = {
  version: 1,
  id: "f1",
  name: "Bilet satışı — “test”",
  description: "",
  nodes: [
    {
      id: "t",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
  ],
  edges: [],
};

describe("document hash", () => {
  test("round-trips a document, including non-ASCII text", () => {
    const hash = encodeDocumentHash(document);
    expect(hash.startsWith("#")).toBe(true);
    expect(hash).toMatch(/^#[A-Za-z0-9_-]+$/);
    expect(decodeDocumentHash(hash)).toEqual(document);
  });

  test("accepts the hash with or without its leading #", () => {
    const hash = encodeDocumentHash(document);
    expect(decodeDocumentHash(hash.slice(1))).toEqual(document);
  });

  test("returns null for an empty, malformed, or non-document hash", () => {
    expect(decodeDocumentHash("")).toBeNull();
    expect(decodeDocumentHash("#")).toBeNull();
    expect(decodeDocumentHash("#not base64!")).toBeNull();
    expect(decodeDocumentHash("#" + btoa(JSON.stringify({ hello: "world" })))).toBeNull();
  });
});
