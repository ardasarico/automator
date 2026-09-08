/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("the data loaders map every status the section relies on", async () => {
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
        const table = {
          id: "tbl-1",
          name: "Signups",
          columns: [{ id: "email", name: "Email", type: "text", required: true }],
          recordCount: 2,
          createdAt: "2026-09-08T10:00:00.000Z",
          updatedAt: "2026-09-08T10:00:00.000Z",
        };
        const list = {
          records: [{
            id: "rec-1",
            tableId: "tbl-1",
            values: { email: "a@b.co" },
            createdAt: "2026-09-08T10:00:00.000Z",
            updatedAt: "2026-09-08T10:00:00.000Z",
          }],
          nextCursor: "cursor-2",
        };
        let answer = async () => Response.json({ tables: [table] });
        const calls = [];
        globalThis.fetch = async (url, init) => {
          calls.push([String(url), new Headers(init.headers).get("authorization")]);
          return answer();
        };
        const { DataApiError, getDataTable, listDataRecords, listDataTables } =
          await import("./server");
        const failedWith = (status) => (error) =>
          error instanceof DataApiError && error.status === status;

        assert.deepEqual(await listDataTables(), [table]);
        assert.deepEqual(calls, [[
          "http://api.internal:3001/data/tables", "Bearer privy-token"
        ]]);

        answer = async () => Response.json({ error: "unauthorized" }, { status: 401 });
        await assert.rejects(listDataTables(), /redirect:\\/login/);

        answer = async () => { throw new Error("network down"); };
        await assert.rejects(listDataTables(), failedWith(503));

        answer = async () => Response.json({ error: "unavailable" }, { status: 500 });
        await assert.rejects(listDataTables(), failedWith(500));

        calls.length = 0;
        answer = async () => Response.json(table);
        assert.deepEqual(await getDataTable("tbl 1"), table);
        assert.equal(calls[0][0], "http://api.internal:3001/data/tables/tbl%201");

        answer = async () => Response.json({ error: "not_found" }, { status: 404 });
        assert.equal(await getDataTable("tbl-1"), null);

        calls.length = 0;
        answer = async () => Response.json(list);
        assert.deepEqual(await listDataRecords("tbl-1", { cursor: "abc", limit: 50 }), list);
        assert.equal(
          calls[0][0],
          "http://api.internal:3001/data/tables/tbl-1/records?cursor=abc&limit=50",
        );

        calls.length = 0;
        assert.deepEqual(await listDataRecords("tbl-1"), list);
        assert.equal(calls[0][0], "http://api.internal:3001/data/tables/tbl-1/records");

        answer = async () => Response.json({ error: "unavailable" }, { status: 503 });
        assert.equal(await listDataRecords("tbl-1"), null);

        answer = async () => { throw new Error("network down"); };
        assert.equal(await listDataRecords("tbl-1"), null);

        answer = async () => Response.json({ records: [{ id: "rec-1" }] });
        await assert.rejects(listDataRecords("tbl-1"), /Response body does not match/);

        answer = async () => Response.json({ error: "not_found" }, { status: 404 });
        await assert.rejects(listDataRecords("tbl-1"), failedWith(404));

        token = undefined;
        calls.length = 0;
        await assert.rejects(listDataTables(), /redirect:\\/login/);
        await assert.rejects(listDataRecords("tbl-1"), /redirect:\\/login/);
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
