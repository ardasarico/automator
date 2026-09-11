import { describe, expect, test } from "bun:test";
import { NodeExecutionError } from "./executor";
import { providerSignal, providerTimeoutMs, reach, requireResolved } from "./transport";

describe("reach", () => {
  test("returns what the call answered", async () => {
    expect(await reach("Telegram", async () => 42)).toBe(42);
  });

  test("names the provider and the socket cause behind a generic fetch failure", async () => {
    const failure = new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") });
    const error = await reach("Telegram", async () => {
      throw failure;
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NodeExecutionError);
    expect((error as Error).message).toBe("Could not reach Telegram: ECONNREFUSED");
  });

  test("names a timeout as one", async () => {
    const error = await reach("Resend", async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    }).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("Could not reach Resend: the request timed out");
  });

  test("lets the node's own errors and a cancelled run through untouched", async () => {
    const own = new NodeExecutionError("Discord answered 401");
    await expect(
      reach("Discord", async () => {
        throw own;
      }),
    ).rejects.toBe(own);
    const abort = new DOMException("The run was cancelled.", "AbortError");
    await expect(
      reach("Discord", async () => {
        throw abort;
      }),
    ).rejects.toBe(abort);
  });
});

describe("providerSignal", () => {
  test("is a timeout on its own and follows the run signal when given one", () => {
    expect(providerTimeoutMs).toBe(20_000);
    expect(providerSignal().aborted).toBe(false);
    const run = new AbortController();
    const combined = providerSignal(run.signal);
    expect(combined).not.toBe(run.signal);
    run.abort();
    expect(combined.aborted).toBe(true);
  });
});

describe("requireResolved", () => {
  test("refuses a secret placeholder the resolver left in place", () => {
    expect(requireResolved("re_key", "Resend API key")).toBe("re_key");
    expect(() => requireResolved("{{ secrets.resend }}", "Resend API key")).toThrow(
      "Resend API key references a secret that is not available here",
    );
  });
});
