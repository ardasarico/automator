import { expect, test } from "bun:test";
import { isVisible, sectionFields } from "./layout";

test("sections keep schema order: main, groups by first appearance, advanced last", () => {
  const sections = sectionFields({
    a: { type: "string" },
    z: { type: "number", advanced: true },
    t: { type: "array", group: "Tools" },
    b: { type: "string" },
    u: { type: "string", group: "Tools" },
    n: { type: "string", group: "Names" },
  });
  expect(sections).toEqual([
    { kind: "main", names: ["a", "b"] },
    { kind: "group", label: "Tools", names: ["t", "u"] },
    { kind: "group", label: "Names", names: ["n"] },
    { kind: "advanced", names: ["z"] },
  ]);
});

test("empty sections are dropped", () => {
  expect(sectionFields({ a: { type: "string" } })).toEqual([{ kind: "main", names: ["a"] }]);
  expect(sectionFields({ a: { type: "string", advanced: true } })).toEqual([
    { kind: "advanced", names: ["a"] },
  ]);
  expect(sectionFields({})).toEqual([]);
});

test("isVisible reads equals and includes", () => {
  const byRecord = { showWhen: { field: "target", equals: "record" } };
  expect(isVisible(byRecord, { target: "record" })).toBe(true);
  expect(isVisible(byRecord, { target: "filter" })).toBe(false);
  expect(isVisible(byRecord, {})).toBe(false);
  const withHttp = { showWhen: { field: "tools", includes: "http_get" } };
  expect(isVisible(withHttp, { tools: ["set_variable", "http_get"] })).toBe(true);
  expect(isVisible(withHttp, { tools: [] })).toBe(false);
  expect(isVisible(withHttp, { tools: "http_get" })).toBe(false);
  expect(isVisible({}, {})).toBe(true);
});
