import { describe, expect, test } from "bun:test";
import { meContract, sessionContract } from "@automator/contracts";
import { AuthApiError, requestAuth } from "./auth";

describe("auth API client", () => {
  test("forwards the token privately and never caches authenticated data", async () => {
    let sent: RequestInit | undefined;
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
    expect(sent?.headers).toMatchObject({ Authorization: "Bearer test-token" });
    expect(sent?.cache).toBe("no-store");
  });
  test("missing authentication never calls the API", async () => {
    await expect(
      requestAuth("http://api", undefined, meContract, undefined, async () => {
        throw new Error("Must not fetch");
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  test.each([
    Response.json({ user: { id: "incomplete" } }),
    Response.json({ error: "database credentials" }, { status: 500 }),
  ])("hides malformed backend responses", async (response) => {
    await expect(
      requestAuth("http://api", "token", sessionContract, undefined, async () => response),
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
  test("preserves expected username conflict for the form", async () => {
    const response = Response.json({ error: "username_taken" }, { status: 409 });
    await expect(
      requestAuth("http://api", "token", meContract, undefined, async () => response),
    ).rejects.toBeInstanceOf(AuthApiError);
  });
});
