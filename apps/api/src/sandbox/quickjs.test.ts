import { describe, expect, test } from "bun:test";
import { createQuickJsSandbox } from "./quickjs";

const limits = { timeoutMs: 500, memoryMb: 32 };

describe("QuickJS sandbox", () => {
  const sandbox = createQuickJsSandbox();

  test("runs code against JSON copies of input and vars", async () => {
    const input = { items: [1, 2, 3] };
    const result = await sandbox.run(
      "input.items.push(4); return { sum: input.items.reduce((a, b) => a + b, 0), who: vars.who };",
      input,
      { who: "arda" },
      limits,
    );
    expect(result).toEqual({ sum: 10, who: "arda" });
    expect(input.items).toEqual([1, 2, 3]);
  });

  test("has no host bindings", async () => {
    for (const probe of [
      "typeof fetch",
      "typeof process",
      "typeof require",
      "typeof setTimeout",
      "typeof Bun",
    ])
      expect(await sandbox.run(`return ${probe};`, null, {}, limits)).toBe("undefined");
  });

  test("reports thrown errors, timeouts and memory exhaustion", async () => {
    await expect(sandbox.run("throw new Error('boom');", null, {}, limits)).rejects.toThrow("boom");
    await expect(sandbox.run("while (true) {}", null, {}, limits)).rejects.toThrow(
      "timed out after 500 ms",
    );
    await expect(
      sandbox.run(
        "const a = []; while (true) a.push(new Array(1e6).fill('x'));",
        null,
        {},
        {
          timeoutMs: 5000,
          memoryMb: 8,
        },
      ),
    ).rejects.toThrow(/memory|timed out/);
  });

  test("returns undefined for no return value", async () => {
    expect(await sandbox.run("const x = 1;", null, {}, limits)).toBeUndefined();
  });
});
