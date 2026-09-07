import { flowNodeTypes } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  catalog,
  catalogCategories,
  categoryLabels,
  categoryOrder,
  getCatalogEntry,
  type FlowNodeCategory,
} from "./catalog";

describe("node catalog", () => {
  test("covers every contract node type exactly once", () => {
    const types = catalog.map((entry) => entry.type);
    expect([...types].sort()).toEqual([...flowNodeTypes].sort());
    expect(new Set(types).size).toBe(types.length);
  });

  test("triggers have no inputs and every other type has at least one", () => {
    for (const entry of catalog) {
      if (entry.category === "trigger") {
        expect(entry.inputs).toEqual([]);
      } else {
        expect(entry.inputs.length).toBeGreaterThan(0);
      }
    }
  });

  test("every type has at least one output", () => {
    for (const entry of catalog) {
      expect(entry.outputs.length).toBeGreaterThan(0);
    }
  });

  test("port ids are unique within each side and every port has a label", () => {
    for (const entry of catalog) {
      for (const ports of [entry.inputs, entry.outputs]) {
        const ids = ports.map((port) => port.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const port of ports) {
          expect(port.id.length).toBeGreaterThan(0);
          expect(port.label.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("every entry has a label and a one-sentence description", () => {
    for (const entry of catalog) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.endsWith(".")).toBe(true);
    }
  });

  test("category order names every category once", () => {
    expect([...categoryOrder].sort()).toEqual(
      Object.keys(catalogCategories).sort() as FlowNodeCategory[],
    );
  });

  test("categoryLabels names the same categories as catalogCategories", () => {
    expect(Object.keys(categoryLabels).sort()).toEqual(Object.keys(catalogCategories).sort());
  });

  test("getCatalogEntry returns the entry for a type", () => {
    expect(getCatalogEntry("integration.privy-wallet").label).toBe("Privy Wallet");
  });
});
