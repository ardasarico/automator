import { Type, type Static } from "@sinclair/typebox";

/** Config schemas for the loop and code nodes. */

/** Runs the steps after `item` once per element of the list, up to `maxItems` of them. */
export const forEachConfigSchema = Type.Object({
  /** The list to loop over: a template that resolves to an array, or JSON text. */
  items: Type.String({
    default: "{{input.items}}",
    description: "A template that resolves to a list, such as {{input.items}}.",
  }),
  maxItems: Type.Integer({
    minimum: 1,
    maximum: 100,
    default: 100,
    description: "Stops after this many items; 100 at most.",
  }),
});
export type ForEachConfig = Static<typeof forEachConfigSchema>;

/** The body of `function (input, vars) { … }`, run in an isolated interpreter. */
export const runCodeConfigSchema = Type.Object({
  code: Type.String({
    default: "return input;",
    description:
      "JavaScript for the body of function (input, vars). Return a JSON value; no network, files or timers.",
  }),
});
export type RunCodeConfig = Static<typeof runCodeConfigSchema>;
