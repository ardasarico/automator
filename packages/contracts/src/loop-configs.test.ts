import { expect, test } from "bun:test";
import { forEachConfigSchema, runCodeConfigSchema } from "./loop-configs";
import { NodeConfigError, parseNodeConfig } from "./node-config";

test("loop configs default sensibly and cap the item count", () => {
  expect(parseNodeConfig(forEachConfigSchema, {})).toEqual({
    items: "{{input.items}}",
    maxItems: 100,
  });
  expect(() => parseNodeConfig(forEachConfigSchema, { maxItems: 500 })).toThrow(NodeConfigError);
  expect(parseNodeConfig(runCodeConfigSchema, {})).toEqual({ code: "return input;" });
});
