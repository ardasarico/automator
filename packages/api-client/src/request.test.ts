import { describe, expect, test } from "bun:test";
import {
  ContractError,
  Type,
  apiErrorSchema,
  meContract,
  profileContract,
} from "@automator/contracts";
import { ApiRequestError, request, type ApiRequestInit } from "./request";

const runContract = {
  method: "GET",
  path: "/flows/:id/runs/:runId",
  params: Type.Object({ id: Type.String(), runId: Type.String() }),
  response: { 200: Type.Object({ id: Type.String() }), 404: apiErrorSchema },
} as const;

describe("contract-driven request", () => {
  test("returns the declared status and validated payload", async () => {
    const result = await request("http://api", meContract, {
      token: "t",
      fetcher: async () => Response.json({ user: null }),
    });
    expect(result).toEqual({ status: 200, data: { user: null } });
  });

  test("returns declared error statuses instead of throwing", async () => {
    const result = await request("http://api", meContract, {
      token: "t",
      fetcher: async () => Response.json({ error: "unauthorized" }, { status: 401 }),
    });
    expect(result).toEqual({ status: 401, data: { error: "unauthorized" } });
  });

  test("throws on a status the contract does not declare", async () => {
    await expect(
      request("http://api", runContract, {
        params: { id: "f1", runId: "r1" },
        fetcher: async () => Response.json({ error: "unavailable" }, { status: 500 }),
      }),
    ).rejects.toBeInstanceOf(ContractError);
  });

  test("throws on a payload that does not match the declared status", async () => {
    await expect(
      request("http://api", meContract, {
        token: "t",
        fetcher: async () => Response.json({ user: { id: "incomplete" } }),
      }),
    ).rejects.toBeInstanceOf(ContractError);
  });

  test("fills path parameters into the request URL", async () => {
    let seen: string | undefined;
    await request("http://api.internal:3001", runContract, {
      params: { id: "flow 1", runId: "r2" },
      fetcher: async (url) => {
        seen = String(url);
        return Response.json({ id: "r2" });
      },
    });
    expect(seen).toBe("http://api.internal:3001/flows/flow%201/runs/r2");
  });

  test("sends the bearer token and never caches", async () => {
    let init: ApiRequestInit | undefined;
    await request("http://api", profileContract, {
      token: "test-token",
      body: { name: "Alice", username: "alice" },
      fetcher: async (_url, sent) => {
        init = sent;
        return Response.json({
          user: { id: "u", name: "Alice", username: "alice", walletAddress: "0x1" },
        });
      },
    });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.cache).toBe("no-store");
    expect(init?.body).toBe(JSON.stringify({ name: "Alice", username: "alice" }));
    expect(init?.method).toBe("PUT");
  });

  test.each(["Authorization", "authorization", "AUTHORIZATION"])(
    "sends extra headers without letting %s replace the bearer token",
    async (name) => {
      let init: ApiRequestInit | undefined;
      await request("http://api", meContract, {
        token: "t",
        headers: { "X-Forwarded-For": "203.0.113.9, 10.0.0.1", [name]: "Bearer spoofed" },
        fetcher: async (_url, sent) => {
          init = sent;
          return Response.json({ user: null });
        },
      });
      const headers = new Headers(init?.headers);
      expect(headers.get("x-forwarded-for")).toBe("203.0.113.9, 10.0.0.1");
      expect(headers.get("authorization")).toBe("Bearer t");
    },
  );

  test("only the token option can authenticate a request", async () => {
    await request("http://api", meContract, {
      headers: { authorization: "Bearer unintended" },
      fetcher: async (_url, init) => {
        expect(new Headers(init.headers).has("authorization")).toBe(false);
        return Response.json({ user: null });
      },
    });
  });

  test("sets one JSON content type regardless of extra header casing", async () => {
    await request("http://api", profileContract, {
      token: "t",
      body: { name: "Alice", username: "alice" },
      headers: { "content-type": "text/plain" },
      fetcher: async (_url, init) => {
        expect(new Headers(init.headers).get("content-type")).toBe("application/json");
        return Response.json({
          user: { id: "u", name: "Alice", username: "alice", walletAddress: "0x1" },
        });
      },
    });
  });

  test("omits the body and its content type for a request without one", async () => {
    let init: ApiRequestInit | undefined;
    await request("http://api", meContract, {
      token: "t",
      fetcher: async (_url, sent) => {
        init = sent;
        return Response.json({ user: null });
      },
    });
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
  });

  test.each([
    ["a missing API URL", undefined, async () => Response.json({ user: null })],
    [
      "a network failure",
      "http://api",
      async () => {
        throw new TypeError("Connection refused");
      },
    ],
    [
      "a non-JSON body",
      "http://api",
      async () => new Response("<html>gateway</html>", { status: 502 }),
    ],
  ] as const)("reports %s as an unreachable API", async (_label, apiUrl, fetcher) => {
    await expect(request(apiUrl, meContract, { token: "t", fetcher })).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });

  test("a network failure says the API could not be reached and keeps the cause", async () => {
    const refused = new TypeError("Connection refused");
    const error = await request("http://api", meContract, {
      token: "t",
      fetcher: async () => {
        throw refused;
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as Error).message).toBe("Could not reach GET /auth/me: Connection refused");
    expect((error as Error).cause).toBe(refused);
  });

  test("a timeout is named as one", async () => {
    const error = await request("http://api", meContract, {
      token: "t",
      timeoutMs: 5,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    }).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("Could not reach GET /auth/me: the request timed out");
  });

  test.each([
    ["an HTML gateway page", new Response("<html>gateway</html>", { status: 502 }), 502],
    ["an empty body", new Response(null, { status: 204 }), 204],
  ])(
    "%s reports the status it came with, not an unreachable API",
    async (_label, response, status) => {
      const error = await request("http://api", meContract, {
        token: "t",
        fetcher: async () => response,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as Error).message).toBe(`GET /auth/me answered ${status} without a JSON body`);
      expect((error as Error).cause).toBeInstanceOf(Error);
    },
  );

  test("a caller signal aborts the request without replacing the timeout", async () => {
    const caller = new AbortController();
    let sent: AbortSignal | undefined;
    const pending = request("http://api", meContract, {
      token: "t",
      signal: caller.signal,
      timeoutMs: 60_000,
      fetcher: async (_url, init) => {
        sent = init.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });
    caller.abort();
    await expect(pending).rejects.toBeInstanceOf(ApiRequestError);
    expect(sent).not.toBe(caller.signal);
    expect(sent?.aborted).toBe(true);
  });

  test("the timeout still fires when the caller passes a signal that never aborts", async () => {
    const caller = new AbortController();
    const pending = request("http://api", meContract, {
      token: "t",
      signal: caller.signal,
      timeoutMs: 5,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("timed out")));
        }),
    });
    await expect(pending).rejects.toBeInstanceOf(ApiRequestError);
    expect(caller.signal.aborted).toBe(false);
  });

  test("body and params are typed by the contract", async () => {
    const fetcher = async () => Response.json({ user: null });
    // @ts-expect-error meContract declares no body
    await request("http://api", meContract, { token: "t", body: { name: "x" }, fetcher });
    await expect(
      // @ts-expect-error profileContract requires a username in the body
      request("http://api", profileContract, { token: "t", body: { name: "x" }, fetcher }),
    ).rejects.toBeInstanceOf(ContractError);
    await expect(
      // @ts-expect-error runContract requires both path parameters
      request("http://api", runContract, { params: { id: "f1" }, fetcher }),
    ).rejects.toBeInstanceOf(ContractError);
  });
});
