import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";

/**
 * Config schemas for the routing and collection nodes (`logic.switch`, `logic.merge`,
 * `logic.filter`). Like the other node configs every field has a default, and string fields
 * accept `{{path}}` templates resolved at run time against `input`, `vars` and `trigger`.
 */

const operatorSchema = Type.Union(
  conditionOperators.map((operator) => Type.Literal(operator)),
  { default: "equals" },
);

/** Sends the value to `match` when it equals one of the cases, otherwise to `default`. */
export const switchConfigSchema = Type.Object({
  value: Type.String({ default: "{{input.value}}" }),
  /** Compared as text; a value equal to any entry matches. */
  cases: Type.Array(Type.String(), { default: [] }),
});
export type SwitchConfig = Static<typeof switchConfigSchema>;

export const mergeModes = ["combine", "first", "list"] as const;
export type MergeMode = (typeof mergeModes)[number];

/**
 * How the inputs that fired become one value: `combine` merges objects shallowly (B wins)
 * and otherwise keeps `{ a, b }`; `first` takes the first input that fired, A preferred;
 * `list` collects the fired inputs in order.
 */
export const mergeConfigSchema = Type.Object({
  mode: Type.Union(
    mergeModes.map((mode) => Type.Literal(mode)),
    { default: "combine" },
  ),
});
export type MergeConfig = Static<typeof mergeConfigSchema>;

/**
 * Splits a list into `kept` and `dropped` by testing each item: `field` is a dot path read
 * from the item (blank tests the item itself), compared with `operator` against `value`.
 */
export const filterConfigSchema = Type.Object({
  items: Type.String({ default: "{{input.items}}" }),
  field: Type.String({ default: "" }),
  operator: operatorSchema,
  value: Type.String({ default: "" }),
});
export type FilterConfig = Static<typeof filterConfigSchema>;

/** The entries to add to `flowNodeConfigSchemas` for these types. */
export const logicConfigSchemas = {
  "logic.switch": switchConfigSchema,
  "logic.merge": mergeConfigSchema,
  "logic.filter": filterConfigSchema,
} as const;
