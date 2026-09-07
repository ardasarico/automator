import { describe, expect, test } from "bun:test";
import { resolveFlowDocument } from "./resolve-document";

describe("resolveFlowDocument", () => {
  test("returns an empty flow without an example", () => {
    const document = resolveFlowDocument("abc", undefined);
    expect(document).toMatchObject({ id: "abc", name: "Untitled flow", nodes: [], edges: [] });
  });

  test("seeds from a known example", () => {
    const document = resolveFlowDocument("abc", "ticket-checkout");
    expect(document.name).toBe("Ticket checkout");
    expect(document.nodes.length).toBeGreaterThan(0);
  });

  test("ignores an unknown example and array params", () => {
    expect(resolveFlowDocument("abc", "nope").nodes).toEqual([]);
    expect(resolveFlowDocument("abc", ["ticket-checkout"]).name).toBe("Ticket checkout");
  });
});
