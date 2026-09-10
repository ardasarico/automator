import { describe, expect, test } from "bun:test";
import { insertTemplate, textFieldShape } from "./schema";

describe("insertTemplate", () => {
  test("swaps a field that holds a single placeholder, wherever the caret sits", () => {
    expect(insertTemplate("{{input.value}}", "{{vars.total}}", { start: 15, end: 15 })).toEqual({
      text: "{{vars.total}}",
      caret: 14,
    });
    expect(insertTemplate("  {{input.value}} ", "{{vars.total}}")).toEqual({
      text: "{{vars.total}}",
      caret: 14,
    });
  });

  test("replaces a selection and inserts at a collapsed caret", () => {
    expect(insertTemplate("Paid 12 USDC", "{{x}}", { start: 5, end: 7 })).toEqual({
      text: "Paid {{x}} USDC",
      caret: 10,
    });
    expect(insertTemplate("Paid  USDC", "{{x}}", { start: 5, end: 5 })).toEqual({
      text: "Paid {{x}} USDC",
      caret: 10,
    });
  });

  test("swaps the placeholder the caret sits inside, and appends beside one it sits after", () => {
    expect(insertTemplate("Paid {{a}} today", "{{b}}", { start: 8, end: 8 })).toEqual({
      text: "Paid {{b}} today",
      caret: 10,
    });
    expect(insertTemplate("Paid {{a}}", "{{b}}", { start: 10, end: 10 })).toEqual({
      text: "Paid {{a}}{{b}}",
      caret: 15,
    });
  });

  test("falls back to appending when the field was never focused", () => {
    expect(insertTemplate("", "{{x}}")).toEqual({ text: "{{x}}", caret: 5 });
    expect(insertTemplate("Paid so far:", "{{x}}")).toEqual({
      text: "Paid so far: {{x}}",
      caret: 18,
    });
  });

  test("a selection left over from longer text cannot cut outside the value", () => {
    expect(insertTemplate("Hi", "{{x}}", { start: 40, end: 60 })).toEqual({
      text: "Hi{{x}}",
      caret: 7,
    });
  });
});

describe("textFieldShape", () => {
  test("gives code a code editor, prose room, and everything else a line", () => {
    expect(textFieldShape("code", {})).toBe("code");
    expect(textFieldShape("body", {})).toBe("multiline");
    expect(textFieldShape("chatId", {})).toBe("line");
  });

  test("follows a schema that names a source media type", () => {
    expect(textFieldShape("expression", { contentMediaType: "text/javascript" })).toBe("code");
    expect(textFieldShape("query", { contentMediaType: "application/graphql" })).toBe("code");
  });
});
