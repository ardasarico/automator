import { describe, expect, test } from "bun:test";
import { meContract, profileContract, sessionContract } from "@automator/contracts";
import { AuthApiError, requestAuth } from "./auth";

describe("auth API client", () => {
  test("forwards the token privately and never caches authenticated data", async () => {
    let sent: Parameters<Parameters<typeof requestAuth>[4] & object>[1] | undefined;
    const result = await requestAuth(
      "http://api.internal:3001",
      "test-token",
      meContract,
      undefined,
      async (url, init) => {
        expect(String(url)).toBe("http://api.internal:3001/auth/me");
        sent = init;
        return Response.json({ user: null });
      },
    );
    expect(result).toEqual({ user: null });
    expect(new Headers(sent?.headers).get("authorization")).toBe("Bearer test-token");
    expect(sent?.cache).toBe("no-store");
  });

  test("an unreachable API is unavailable to the page but keeps its cause for the log", async () => {
    const refused = new TypeError("Connection refused");
    const error = await requestAuth("http://api", "token", meContract, undefined, async () => {
      throw refused;
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthApiError);
    expect(error).toMatchObject({ status: 503, code: "unavailable" });
    expect((error as Error).cause).toMatchObject({ name: "ApiRequestError", cause: refused });
  });

  test("missing authentication never calls the API", async () => {
    await expect(
      requestAuth("http://api", undefined, meContract, undefined, async () => {
        throw new Error("Must not fetch");
      }),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  test("missing configuration never calls the API", async () => {
    await expect(
      requestAuth(undefined, "token", meContract, undefined, async () => {
        throw new Error("Must not fetch");
      }),
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });

  test.each([
    ["an incomplete success payload", Response.json({ user: { id: "incomplete" } })],
    ["a leaking error body", Response.json({ error: "database credentials" }, { status: 500 })],
    ["an undeclared status", Response.json({ error: "unavailable" }, { status: 418 })],
  ])("hides %s behind an unavailable API", async (_label, response) => {
    await expect(
      requestAuth("http://api", "token", sessionContract, undefined, async () => response),
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });

  test("preserves the username conflict the onboarding form acts on", async () => {
    const response = Response.json({ error: "username_taken" }, { status: 409 });
    const failure = requestAuth(
      "http://api",
      "token",
      profileContract,
      { name: "Alice", username: "alice" },
      async () => response,
    );
    await expect(failure).rejects.toBeInstanceOf(AuthApiError);
    await expect(failure).rejects.toMatchObject({ status: 409, code: "username_taken" });
  });

  test("sends the profile body as JSON", async () => {
    let body: unknown;
    const user = { id: "u", name: "Alice", username: "alice", walletAddress: "0x1" };
    await requestAuth(
      "http://api",
      "token",
      profileContract,
      { name: "Alice", username: "alice" },
      async (_url, init) => {
        body = init.body;
        return Response.json({ user });
      },
    );
    expect(body).toBe(JSON.stringify({ name: "Alice", username: "alice" }));
  });
});
