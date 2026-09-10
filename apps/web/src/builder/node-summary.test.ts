import type { DataTable } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { getCatalogEntry } from "./catalog";
import { nodeFamily, nodeSummary, screenItems } from "./node-summary";

const tables = [{ id: "t1", name: "Signups" } as DataTable];

describe("nodeSummary", () => {
  test("a data node names its table", () => {
    expect(
      nodeSummary({ id: "n", type: "data.create-record", config: { tableId: "t1" } }, tables),
    ).toBe("in Signups");
  });

  test("a data node without a table, or with one that is gone, says so", () => {
    expect(nodeSummary({ id: "n", type: "data.find-records", config: {} }, tables)).toBe(
      "no table yet",
    );
    expect(
      nodeSummary({ id: "n", type: "data.find-records", config: { tableId: "gone" } }, tables),
    ).toBe("table not found");
  });

  test("other nodes use the shared summary", () => {
    expect(nodeSummary({ id: "n", type: "usdc.payment", config: { amount: "5" } }, tables)).toBe(
      "collect 5 USDC",
    );
  });

  test("a node with nothing to state falls back to its catalog description", () => {
    expect(nodeSummary({ id: "n", type: "privy.login", config: {} }, tables)).toBe(
      getCatalogEntry("privy.login").description,
    );
  });
});

describe("nodeFamily", () => {
  test("triggers, screens and choosing logic get their own shapes; the rest are steps", () => {
    expect(nodeFamily("trigger.miniapp-open")).toBe("trigger");
    expect(nodeFamily("world.verification-completed")).toBe("trigger");
    expect(nodeFamily("screen.form")).toBe("screen");
    expect(nodeFamily("logic.condition")).toBe("branch");
    expect(nodeFamily("logic.switch")).toBe("branch");
    expect(nodeFamily("logic.for-each")).toBe("step");
    expect(nodeFamily("usdc.payment")).toBe("step");
    expect(nodeFamily("privy.login")).toBe("step");
  });
});

describe("screenItems", () => {
  test("a form lists its fields by label and its submit button", () => {
    expect(
      screenItems({
        id: "n",
        type: "screen.form",
        config: { fields: [{ id: "email", label: "Email" }, { id: "age" }], submit: "Continue" },
      }),
    ).toEqual(["Email field", "age field", "Continue button"]);
  });

  test("a form with no fields says so and still has its button", () => {
    expect(screenItems({ id: "n", type: "screen.form", config: {} })).toEqual([
      "No fields yet",
      "Submit button",
    ]);
  });

  test("a confirmation names both buttons; a page names its one", () => {
    expect(
      screenItems({ id: "n", type: "screen.confirmation", config: { message: "Sure?" } }),
    ).toEqual(["Message", "Confirm / Cancel buttons"]);
    expect(screenItems({ id: "n", type: "screen.page", config: { button: "Next" } })).toEqual([
      "Next button",
    ]);
  });
});
