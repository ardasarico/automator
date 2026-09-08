import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";

const operatorSchema = Type.Union(
  conditionOperators.map((operator) => Type.Literal(operator)),
  { default: "equals" },
);

export const switchConfigSchema = Type.Object({
  value: Type.String({ default: "{{input.value}}" }),
  cases: Type.Array(Type.String(), { default: [] }),
});
export type SwitchConfig = Static<typeof switchConfigSchema>;

export const mergeModes = ["combine", "first", "list"] as const;
export type MergeMode = (typeof mergeModes)[number];

export const mergeConfigSchema = Type.Object({
  mode: Type.Union(
    mergeModes.map((mode) => Type.Literal(mode)),
    { default: "combine" },
  ),
});
export type MergeConfig = Static<typeof mergeConfigSchema>;

export const filterConfigSchema = Type.Object({
  items: Type.String({ default: "{{input.items}}" }),
  field: Type.String({ default: "" }),
  operator: operatorSchema,
  value: Type.String({ default: "" }),
});
export type FilterConfig = Static<typeof filterConfigSchema>;

export const logicConfigSchemas = {
  "logic.switch": switchConfigSchema,
  "logic.merge": mergeConfigSchema,
  "logic.filter": filterConfigSchema,
} as const;
