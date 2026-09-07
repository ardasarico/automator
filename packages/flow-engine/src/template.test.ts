import { describe, expect, test } from "bun:test";
import { resolveTemplate, resolveTemplates, type TemplateScope } from "./template";

const scope: TemplateScope = {
  input: { message: { text: "hello", count: 2 }, list: ["a", "b"] },
  vars: { name: "Ada" },
  trigger: { body: { amount: 10 } },
};

describe("resolveTemplate", () => {
  test("returns the raw value for a whole-string placeholder", () => {
    expect(resolveTemplate("{{input.message}}", scope)).toEqual({ text: "hello", count: 2 });
    expect(resolveTemplate("{{ input.message.count }}", scope)).toBe(2);
    expect(resolveTemplate("{{input.list.1}}", scope)).toBe("b");
  });

  test("stringifies placeholders inside text", () => {
    expect(
      resolveTemplate("Hi {{vars.name}}, {{input.message.text}} x{{input.message.count}}", scope),
    ).toBe("Hi Ada, hello x2");
    expect(resolveTemplate("amount={{trigger.body}}", scope)).toBe('amount={"amount":10}');
  });

  test("resolves unknown paths to empty text", () => {
    expect(resolveTemplate("{{input.missing.deep}}", scope)).toBe("");
    expect(resolveTemplate("[{{vars.missing}}]", scope)).toBe("[]");
  });

  test("leaves plain text untouched", () => {
    expect(resolveTemplate("no placeholders", scope)).toBe("no placeholders");
  });
});

describe("resolveTemplates", () => {
  test("walks objects and arrays", () => {
    expect(
      resolveTemplates(
        { a: "{{vars.name}}", b: ["{{input.message.count}}", 1], c: { d: true } },
        scope,
      ),
    ).toEqual({ a: "Ada", b: [2, 1], c: { d: true } });
  });
});
