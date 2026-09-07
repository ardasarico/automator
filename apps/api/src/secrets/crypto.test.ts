import { describe, expect, test } from "bun:test";
import {
  createSecretsCrypto,
  generateSecretsKey,
  parseSecretsKey,
  SecretFormatError,
} from "./crypto";

describe("secrets crypto", () => {
  const key = parseSecretsKey(generateSecretsKey())!;
  const crypto = createSecretsCrypto(key);

  test("round-trips text, with a fresh nonce each time", () => {
    const a = crypto.encrypt("https://discord.com/api/webhooks/1/abc");
    const b = crypto.encrypt("https://discord.com/api/webhooks/1/abc");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(crypto.decrypt(a)).toBe("https://discord.com/api/webhooks/1/abc");
    expect(crypto.decrypt(crypto.encrypt("ünïcödé 🔑"))).toBe("ünïcödé 🔑");
  });

  test("rejects tampering, another key, and unknown formats", () => {
    const stored = crypto.encrypt("secret");
    const tampered = stored.slice(0, -2) + (stored.endsWith("A") ? "BB" : "AA");
    expect(() => crypto.decrypt(tampered)).toThrow();
    const other = createSecretsCrypto(parseSecretsKey(generateSecretsKey())!);
    expect(() => other.decrypt(stored)).toThrow();
    expect(() => crypto.decrypt("v0.x.y.z")).toThrow(SecretFormatError);
    expect(() => crypto.decrypt("garbage")).toThrow(SecretFormatError);
  });

  test("parses only 32-byte keys", () => {
    expect(parseSecretsKey(undefined)).toBeNull();
    expect(parseSecretsKey("short")).toBeNull();
    expect(parseSecretsKey(generateSecretsKey())?.length).toBe(32);
  });
});
