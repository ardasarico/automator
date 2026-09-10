import { Type, type Static } from "@sinclair/typebox";

export const forEachConfigSchema = Type.Object({
  items: Type.String({
    default: "{{input.items}}",
    description: "A template that resolves to a list, such as {{input.items}}.",
  }),
  maxItems: Type.Integer({
    minimum: 1,
    maximum: 100,
    default: 100,
    advanced: true,
    description: "Stops after this many items; 100 at most.",
  }),
});
export type ForEachConfig = Static<typeof forEachConfigSchema>;

export const runCodeConfigSchema = Type.Object({
  code: Type.String({
    default: "return input;",
    description:
      "JavaScript for the body of function (input, vars). Return a JSON value; no network, files or timers.",
  }),
});
export type RunCodeConfig = Static<typeof runCodeConfigSchema>;
