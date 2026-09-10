import { apiKeyPrefix } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { generateApiKey, hashApiKey, keyDisplayPrefix, readBearerApiKey } from "./keys";

describe("generateApiKey", () => {
  test("issues a prefixed, url-safe key that is never the same twice", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first.startsWith(apiKeyPrefix)).toBe(true);
    expect(first.slice(apiKeyPrefix.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});

describe("hashApiKey", () => {
  test("is stable for one key and different for another", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()));
  });

  test("does not contain the key it hashes", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).not.toContain(key.slice(apiKeyPrefix.length));
  });
});

describe("keyDisplayPrefix", () => {
  test("keeps the head of the key and nothing that could authenticate", () => {
    const key = generateApiKey();
    const prefix = keyDisplayPrefix(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(11);
  });
});

describe("readBearerApiKey", () => {
  test("reads a key out of an Authorization header", () => {
    expect(readBearerApiKey("Bearer ak_abcDEF123")).toBe("ak_abcDEF123");
    expect(readBearerApiKey("bearer ak_abcDEF123")).toBe("ak_abcDEF123");
  });

  test("ignores a token that is not an API key", () => {
    expect(readBearerApiKey("Bearer eyJhbGciOi.privy.token")).toBeNull();
    expect(readBearerApiKey("ak_abcDEF123")).toBeNull();
    expect(readBearerApiKey(undefined)).toBeNull();
  });
});
