/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("wallet history distinguishes an unavailable API from a confirmed empty history", async () => {
  // Next's module mocks are process-wide; isolate them from the auth and provider tests.
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
        import assert from "node:assert/strict";
        import { mock } from "bun:test";

        mock.module("server-only", () => ({}));
        let token = "privy-token";
        mock.module("next/headers", () => ({
          cookies: async () => ({ get: () => token ? { value: token } : undefined }),
        }));
        mock.module("next/navigation", () => ({
          redirect: (href) => { throw new Error("redirect:" + href); },
        }));

        process.env.API_URL = "http://api.internal:3001";
        let answer = async () => Response.json({ transactions: [] });
        const calls = [];
        globalThis.fetch = async (url, init) => {
          calls.push([String(url), new Headers(init.headers).get("authorization")]);
          return answer();
        };
        const { listWalletTransactions } = await import("./server");

        assert.deepEqual(await listWalletTransactions(), []);
        assert.deepEqual(calls, [[
          "http://api.internal:3001/wallet/transactions", "Bearer privy-token"
        ]]);

        answer = async () => Response.json({ error: "unavailable" }, { status: 503 });
        assert.equal(await listWalletTransactions(), null);

        answer = async () => { throw new Error("network failed"); };
        assert.equal(await listWalletTransactions(), null);

        answer = async () => Response.json({ error: "unauthorized" }, { status: 401 });
        await assert.rejects(listWalletTransactions(), /redirect:\\/login/);

        token = undefined;
        calls.length = 0;
        await assert.rejects(listWalletTransactions(), /redirect:\\/login/);
        assert.equal(calls.length, 0);
      `,
    ],
    {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
