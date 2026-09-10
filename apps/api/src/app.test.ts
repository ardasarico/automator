import { healthContract, parseResponse, Type } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createApp } from "./app";

const up = { check: async () => "up" as const };

describe("health checks", () => {
  test.each(["up", "down", "not_configured"] as const)(
    "reports database %s with the correct readiness status",
    async (databaseStatus) => {
      const app = createApp({ database: { check: async () => databaseStatus } });
      const response = await app.handle(
        new Request(new URL(healthContract.path, "http://localhost").href),
      );
      expect(response.status).toBe(databaseStatus === "up" ? 200 : 503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body: unknown = await response.json();
      expect(parseResponse(healthContract, response.status, body).data).toMatchObject({
        status: databaseStatus === "up" ? "ok" : "error",
        checks: { api: "up", database: databaseStatus },
      });
    },
  );

  test("liveness does not query the database", async () => {
    const app = createApp({
      database: {
        check: () => {
          throw new Error("Must not query");
        },
      },
    });
    const response = await app.handle(new Request("http://localhost/health/live"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test.each(["/", "/health", "/health/live"])("%s is never cacheable", async (path) => {
    const response = await createApp({ database: up }).handle(
      new Request(`http://localhost${path}`),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("root error handler", () => {
  const failing = (thrown: unknown) =>
    createApp({ database: up }).get("/boom", () => {
      throw thrown;
    });

  test("a throwing handler never leaks the message", async () => {
    const response = await failing(new Error("password=hunter2 at 10.0.0.1")).handle(
      new Request("http://localhost/boom"),
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain("hunter2");
  });

  test("a non-Error throw is sanitized the same way", async () => {
    const response = await failing("raw string with secrets").handle(
      new Request("http://localhost/boom"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  test("an unknown route is a 404 with the shared error body", async () => {
    const response = await createApp({ database: up }).handle(
      new Request("http://localhost/does-not-exist"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  test("invalid request input is a 400, not a 500", async () => {
    const app = createApp({ database: up }).use(
      new Elysia().post("/echo", ({ body }) => body, {
        body: Type.Object({ name: Type.String() }),
      }),
    );
    const response = await app.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 42 }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  test("a response that fails its own schema is a 500, not a 400", async () => {
    const app = createApp({ database: up }).get(
      "/broken",
      () => ({ status: "ok", checks: { api: "up", database: "up" }, checkedAt: 42 }) as never,
      { response: healthContract.response },
    );
    const response = await app.handle(new Request("http://localhost/broken"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});

describe("server-side logging", () => {
  async function capture(run: () => Promise<unknown>) {
    const lines: unknown[][] = [];
    const log = console.log;
    const error = console.error;
    console.log = (...args: unknown[]) => lines.push(["log", ...args]);
    console.error = (...args: unknown[]) => lines.push(["error", ...args]);
    try {
      await run();
      await new Promise((resolve) => setTimeout(resolve, 5));
    } finally {
      console.log = log;
      console.error = error;
    }
    return lines;
  }

  test("logs one line per request with method, path, status and duration", async () => {
    const app = createApp({ database: up, log: true });
    const lines = await capture(() => app.handle(new Request("http://localhost/health/live")));
    expect(lines).toHaveLength(1);
    expect(String(lines[0]?.[1])).toMatch(/^GET \/health\/live 200 \d+ms$/);
  });

  test("logs the status a raw Response carried, not the untouched default", async () => {
    /* The MCP routes answer with a Web Response the transport built, which never passes through
     * `set.status`; the access log used to read that stale 200 and report every refusal as ok. */
    const app = createApp({ database: up, log: true }).get(
      "/raw",
      () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );
    const lines = await capture(() => app.handle(new Request("http://localhost/raw")));
    expect(String(lines[0]?.[1])).toMatch(/^GET \/raw 401 \d+ms$/);
  });

  test("stays silent without the log option", async () => {
    const app = createApp({ database: up });
    expect(await capture(() => app.handle(new Request("http://localhost/health/live")))).toEqual(
      [],
    );
  });

  test.each([false, true])(
    "redacts webhook credentials in access and failure logs (failure: %p)",
    async (fails) => {
      const app = createApp({ database: up, log: true }).post("/hooks/:flowId/:token", () => {
        if (fails) throw new Error("storage unavailable");
        return { ok: true };
      });
      const lines = await capture(() =>
        app.handle(
          new Request("http://localhost/hooks/flow-1/execution-secret", { method: "POST" }),
        ),
      );
      expect(JSON.stringify(lines)).not.toContain("execution-secret");
      expect(JSON.stringify(lines)).toContain("/hooks/flow-1/[redacted]");
      if (fails)
        expect(lines.find((line) => line[0] === "error")?.[2]).toMatchObject({
          path: "/hooks/flow-1/[redacted]",
          message: "storage unavailable",
        });
    },
  );

  test("records the real cause of a failure without returning it", async () => {
    const app = createApp({ database: up, log: true }).get("/boom", () => {
      throw new Error("password=hunter2");
    });
    const lines = await capture(() => app.handle(new Request("http://localhost/boom")));
    expect(JSON.stringify(lines)).toContain("hunter2");
  });
});
