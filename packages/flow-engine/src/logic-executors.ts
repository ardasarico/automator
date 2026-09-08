import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "@automator/contracts";
import { NodeExecutionError, type ExecutorRegistry } from "./executor";
import { compare } from "./compare";

function readPath(item: unknown, path: string): unknown {
  if (!path) return item;
  let current = item;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const logicExecutors: ExecutorRegistry = {
  "logic.switch": {
    kind: "step",
    async run(context) {
      const { value, cases } = context.config(switchConfigSchema);
      const matched = cases.some((entry) => compare(value, "equals", entry));
      return matched ? { match: value } : { default: value };
    },
  },

  "logic.merge": {
    kind: "step",
    async run(context) {
      const { mode } = context.config(mergeConfigSchema);
      const fired = ["a", "b"].filter((handle) => handle in context.inputs);
      const values = fired.map((handle) => context.inputs[handle]);
      switch (mode) {
        case "first":
          return { merged: values[0] };
        case "list":
          return { merged: values };
        case "combine": {
          const [a, b] = [context.inputs.a, context.inputs.b];
          if (fired.length === 2 && isPlainObject(a) && isPlainObject(b))
            return { merged: { ...a, ...b } };
          return { merged: fired.length === 1 ? values[0] : { a, b } };
        }
      }
    },
  },

  "logic.filter": {
    kind: "step",
    async run(context) {
      const { items, field, operator, value } = context.config(filterConfigSchema);
      if (!Array.isArray(items))
        throw new NodeExecutionError("Filter needs a list of items to filter");
      const kept: unknown[] = [];
      const dropped: unknown[] = [];
      for (const item of items)
        (compare(readPath(item, field), operator, value) ? kept : dropped).push(item);
      return { kept, dropped };
    },
  },
};
