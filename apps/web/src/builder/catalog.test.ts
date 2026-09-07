import { flowNodeTypes } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  catalog,
  catalogGroups,
  getCatalogGroupSections,
  listCatalogGroups,
  searchCatalog,
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
    expect(getCatalogEntry("privy.wallet").label).toBe("Privy Wallet");
  });

  test("every entry belongs to a defined group, and integration ids carry their provider", () => {
    const ids = new Set(catalogGroups.map((group) => group.id));
    for (const entry of catalog) {
      expect(ids.has(entry.group)).toBe(true);
      const prefix = entry.type.split(".")[0];
      if (prefix === "world" || prefix === "privy" || prefix === "usdc") {
        expect(entry.group).toBe(prefix);
      }
    }
  });

  test("listCatalogGroups counts every entry once, core groups before integrations", () => {
    const groups = listCatalogGroups();
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(catalog.length);
    expect(groups.every((group) => group.count > 0)).toBe(true);
    const firstIntegration = groups.findIndex((group) => group.kind === "integration");
    expect(groups.slice(firstIntegration).every((group) => group.kind === "integration")).toBe(
      true,
    );
  });

  test("a provider group lists its triggers before its actions, in labelled sections", () => {
    const sections = getCatalogGroupSections("world");
    expect(sections.map((section) => section.label)).toEqual(["Triggers", "Actions"]);
    expect(sections[0]!.entries.map((entry) => entry.type)).toEqual([
      "world.verification-completed",
    ]);
    expect(sections.flatMap((section) => section.entries)).toHaveLength(3);
  });

  test("a single-category group is one unlabelled section", () => {
    const sections = getCatalogGroupSections("logic");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.label).toBe("");
    expect(sections[0]!.entries.every((entry) => entry.category === "logic")).toBe(true);
  });

  test("searchCatalog matches labels and descriptions across groups, ignoring case and space", () => {
    expect(
      searchCatalog("  WEBHOOK ")
        .flatMap((s) => s.entries)
        .map((e) => e.type),
    ).toEqual(["trigger.webhook"]);
    const visitor = searchCatalog("visitor");
    expect(visitor.map((section) => section.label)).toEqual([
      "Triggers",
      "Screens",
      "World",
      "Privy",
    ]);
    expect(visitor.flatMap((s) => s.entries).map((e) => e.type)).toContain("privy.wallet");
    expect(searchCatalog("")).toEqual([]);
    expect(searchCatalog("nothing matches this")).toEqual([]);
  });
});
