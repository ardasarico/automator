/// <reference types="bun" />
import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { isSameOrigin } = await import("./http");

function request(
  headers: Record<string, string>,
  url = "https://app.automator.dev/api/auth/session",
) {
  return new Request(url, { method: "POST", headers });
}

test("same-origin requires the same scheme, host, and port", () => {
  expect(isSameOrigin(request({ origin: "https://app.automator.dev" }))).toBe(true);
  for (const origin of [
    "http://app.automator.dev",
    "https://other.automator.dev",
    "https://app.automator.dev:3000",
    "null",
    "not a URL",
  ]) {
    expect(isSameOrigin(request({ origin }))).toBe(false);
  }
});

test("a proxy's forwarded protocol is compared alongside its public host", () => {
  const headers = {
    origin: "https://app.automator.dev",
    "x-forwarded-host": "app.automator.dev",
    "x-forwarded-proto": "https",
  };
  const internalUrl = "http://10.0.0.4:3000/api/auth/session";
  expect(isSameOrigin(request(headers, internalUrl))).toBe(true);
  expect(
    isSameOrigin(request({ ...headers, origin: "http://app.automator.dev" }, internalUrl)),
  ).toBe(false);
  expect(isSameOrigin(request({ ...headers, "x-forwarded-proto": "http" }, internalUrl))).toBe(
    false,
  );
});

test("forwarded protocol lists use the final hop just like forwarded host lists", () => {
  const headers = {
    origin: "https://app.automator.dev",
    "x-forwarded-host": "other.automator.dev, app.automator.dev",
    "x-forwarded-proto": "http, https",
  };
  const internalUrl = "http://10.0.0.4:3000/api/auth/session";
  expect(isSameOrigin(request(headers, internalUrl))).toBe(true);
  expect(
    isSameOrigin(request({ ...headers, "x-forwarded-proto": "https, http" }, internalUrl)),
  ).toBe(false);
});

test("local HTTP requests remain same-origin", () => {
  expect(
    isSameOrigin(
      request({ origin: "http://localhost:3000" }, "http://localhost:3000/api/auth/session"),
    ),
  ).toBe(true);
});
