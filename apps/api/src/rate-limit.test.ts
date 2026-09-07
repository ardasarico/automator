import { describe, expect, test } from "bun:test";
import { clientAddress, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  test("keys per caller and lets a key through again once the window moves on", () => {
    let clock = 0;
    const limiter = createRateLimiter(1, () => clock);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
    clock = 60_001;
    expect(limiter.allow("a")).toBe(true);
  });

  test("refusals do not extend the window", () => {
    let clock = 0;
    const limiter = createRateLimiter(2, () => clock);
    limiter.allow("a");
    clock = 30_000;
    limiter.allow("a");
    clock = 59_000;
    expect(limiter.allow("a")).toBe(false);
    clock = 60_001;
    expect(limiter.allow("a")).toBe(true);
  });

  test("retryAfter counts the seconds until the oldest call leaves the window", () => {
    let clock = 0;
    const limiter = createRateLimiter(1, () => clock);
    limiter.allow("a");
    clock = 15_500;
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.retryAfter("a")).toBe(45);
    clock = 59_999;
    expect(limiter.retryAfter("a")).toBe(1);
    expect(limiter.retryAfter("never-seen")).toBe(1);
  });
});

describe("clientAddress", () => {
  test("takes the first forwarded address, then the socket, then unknown", () => {
    expect(clientAddress("203.0.113.9, 10.0.0.1", "10.0.0.2")).toBe("203.0.113.9");
    expect(clientAddress(" 203.0.113.9 ", "10.0.0.2")).toBe("203.0.113.9");
    expect(clientAddress(null, "10.0.0.2")).toBe("10.0.0.2");
    expect(clientAddress("", "10.0.0.2")).toBe("10.0.0.2");
    expect(clientAddress(" , ", undefined)).toBe("unknown");
    expect(clientAddress(undefined, undefined)).toBe("unknown");
  });
});
