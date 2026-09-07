import { describe, expect, test } from "bun:test";
import { SecretMissingError, secretsScope } from "./secrets";
import { resolveTemplates } from "./template";

describe("secretsScope", () => {
  test("resolves only the names the config references", async () => {
    const asked: string[][] = [];
    const scope = await secretsScope(
      { url: "{{secrets.hook}}", text: "plain" },
      {
        get: async (names) => {
          asked.push([...names]);
          return { hook: "https://example.test" };
        },
      },
    );
    expect(scope).toEqual({ hook: "https://example.test" });
    expect(asked).toEqual([["hook"]]);
  });

  test("does not call the resolver when nothing is referenced", async () => {
    let calls = 0;
    const scope = await secretsScope(
      { text: "plain" },
      {
        get: async () => {
          calls += 1;
          return {};
        },
      },
    );
    expect(scope).toEqual({});
    expect(calls).toBe(0);
  });

  test("fails on a name the resolver does not know", async () => {
    await expect(
      secretsScope({ a: "{{secrets.one}} {{secrets.two}}" }, { get: async () => ({ one: "1" }) }),
    ).rejects.toThrow(new SecretMissingError(["two"]).message);
  });

  test("keeps placeholders literal without a resolver", async () => {
    const scope = await secretsScope({ url: "{{secrets.hook}}" }, undefined);
    const resolved = resolveTemplates(
      { url: "{{secrets.hook}}", text: "Key: {{secrets.hook}}!" },
      { input: {}, vars: {}, trigger: undefined, secrets: scope },
    );
    expect(resolved).toEqual({ url: "{{secrets.hook}}", text: "Key: {{secrets.hook}}!" });
  });
});
