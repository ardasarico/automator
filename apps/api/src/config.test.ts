import { describe, expect, test } from "bun:test";
import { readConfig } from "./config";

const complete = {
  DATABASE_URL: "postgres://localhost/automator",
  PRIVY_APP_ID: "app",
  PRIVY_APP_SECRET: "secret",
  PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----",
};

function quietly<T>(run: () => T) {
  const warn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args[0]);
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = warn;
  }
}

describe("API configuration", () => {
  test("reads every variable", () => {
    const config = readConfig({ ...complete, PORT: "4000" });
    expect(config).toEqual({
      port: 4000,
      databaseUrl: complete.DATABASE_URL,
      privyAppId: "app",
      privyAppSecret: "secret",
      privyVerificationKey: "-----BEGIN PUBLIC KEY-----",
    });
  });

  test.each([undefined, "", "not-a-number"])("falls back to port 3001 for PORT %p", (port) => {
    expect(readConfig({ ...complete, PORT: port }).port).toBe(3001);
  });

  test("development starts without a verification key but says what it costs", () => {
    const { result, warnings } = quietly(() =>
      readConfig({ ...complete, PRIVY_VERIFICATION_KEY: undefined }),
    );
    expect(result.privyVerificationKey).toBeUndefined();
    expect(warnings.map(String).join(" ")).toContain("JWKS fetch failures will surface as 401");
  });

  test("a configured verification key warns about nothing", () => {
    expect(quietly(() => readConfig(complete)).warnings).toEqual([]);
  });

  test.each(["DATABASE_URL", "PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_VERIFICATION_KEY"])(
    "production refuses to start without %s",
    (name) => {
      const env = { ...complete, NODE_ENV: "production", [name]: undefined };
      expect(() => readConfig(env)).toThrow(new RegExp(name));
    },
  );

  test("development warns and starts degraded", () => {
    const { result, warnings } = quietly(() => readConfig({ NODE_ENV: "development" }));
    expect(result.databaseUrl).toBeUndefined();
    expect(String(warnings[0])).toContain("DATABASE_URL");
    expect(String(warnings[0])).toContain("PRIVY_APP_SECRET");
  });
});
