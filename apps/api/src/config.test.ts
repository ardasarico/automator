import { describe, expect, test } from "bun:test";
import { readConfig, defaultOpenAiModel } from "./config";

const secretsKey = Buffer.alloc(32, 7).toString("base64");

const complete = {
  DATABASE_URL: "postgres://localhost/automator",
  PRIVY_APP_ID: "app",
  PRIVY_APP_SECRET: "secret",
  PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----",
  SECRETS_KEY: secretsKey,
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
  test("reads the e2e test token outside production and refuses it there", () => {
    expect(readConfig({ ...complete, E2E_TEST_TOKEN: "e2e-secret" }).e2eTestToken).toBe(
      "e2e-secret",
    );
    expect(readConfig(complete).e2eTestToken).toBeUndefined();
    expect(() =>
      readConfig({ ...complete, E2E_TEST_TOKEN: "e2e-secret", NODE_ENV: "production" }),
    ).toThrow("E2E_TEST_TOKEN must not be set in production");
  });

  test("reads every variable", () => {
    const config = readConfig({ ...complete, PORT: "4000" });
    expect(config).toEqual({
      port: 4000,
      databaseUrl: complete.DATABASE_URL,
      privyAppId: "app",
      privyAppSecret: "secret",
      privyVerificationKey: "-----BEGIN PUBLIC KEY-----",
      openRouterApiKey: undefined,
      openRouterModel: "openai/gpt-oss-120b",
      tokenApiKey: undefined,
      tokenApiUrl: undefined,
      graphApiKey: undefined,
      graphGatewayUrl: undefined,
      openAiApiKey: undefined,
      openAiModel: defaultOpenAiModel,
      secretsKey: Buffer.from(secretsKey, "base64"),
      chainId: 84532,
      chainRpcUrl: "https://sepolia.base.org",
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      chainRpcUrls: {},
      privyAuthorizationKey: undefined,
      privySignerId: undefined,
      world: undefined,
      e2eTestToken: undefined,
      rateLimits: { runs: 30, data: 30, ai: 10, secrets: 30, sessions: 60, webhooks: 60 },
    });
  });

  test("reads the configured Privy signer ID independently of the authorization key", () => {
    expect(readConfig({ ...complete, PRIVY_SIGNER_ID: "app-signer" }).privySignerId).toBe(
      "app-signer",
    );
  });

  test("rate limits take positive integers from the environment and ignore the rest", () => {
    const config = readConfig({
      ...complete,
      RATE_LIMIT_RUNS: "5",
      RATE_LIMIT_AI: "0",
      RATE_LIMIT_SECRETS: "lots",
      RATE_LIMIT_SESSIONS: "2.5",
      RATE_LIMIT_WEBHOOKS: "120",
    });
    expect(config.rateLimits).toEqual({
      runs: 5,
      data: 30,
      ai: 10,
      secrets: 30,
      sessions: 60,
      webhooks: 120,
    });
  });

  test("development without a secrets key warns and generates one for the process", () => {
    const { result, warnings } = quietly(() =>
      readConfig({ ...complete, SECRETS_KEY: undefined, NODE_ENV: "development" }),
    );
    expect(result.secretsKey.length).toBe(32);
    expect(warnings.map(String).join(" ")).toContain("SECRETS_KEY is not set");
    const short = quietly(() => readConfig({ ...complete, SECRETS_KEY: "short" }));
    expect(short.result.secretsKey.length).toBe(32);
    expect(short.warnings.map(String).join(" ")).toContain("32 bytes");
  });

  test("production refuses a missing or malformed secrets key", () => {
    expect(() => readConfig({ ...complete, SECRETS_KEY: "short", NODE_ENV: "production" })).toThrow(
      "32 bytes",
    );
  });

  test("The Graph gateway key is optional and its origin override is read beside it", () => {
    expect(readConfig({ ...complete, GRAPH_API_KEY: "", GRAPH_GATEWAY_URL: "" })).toMatchObject({
      graphApiKey: undefined,
      graphGatewayUrl: undefined,
    });
    expect(
      readConfig({ ...complete, GRAPH_API_KEY: "studio", GRAPH_GATEWAY_URL: "https://gw.test" }),
    ).toMatchObject({ graphApiKey: "studio", graphGatewayUrl: "https://gw.test" });
  });

  test("OpenRouter is optional, with a default model that a blank variable keeps", () => {
    expect(readConfig({ ...complete, OPENROUTER_API_KEY: "", OPENROUTER_MODEL: "" })).toMatchObject(
      {
        openRouterApiKey: undefined,
        openRouterModel: "openai/gpt-oss-120b",
        tokenApiKey: undefined,
        tokenApiUrl: undefined,
      },
    );
    expect(
      readConfig({ ...complete, OPENROUTER_API_KEY: "sk", OPENROUTER_MODEL: "anthropic/claude" }),
    ).toMatchObject({ openRouterApiKey: "sk", openRouterModel: "anthropic/claude" });
  });

  test("OpenAI is optional, with a default model that a blank variable keeps", () => {
    expect(readConfig({ ...complete, OPENAI_API_KEY: "", OPENAI_MODEL: "" })).toMatchObject({
      openAiApiKey: undefined,
      openAiModel: defaultOpenAiModel,
    });
    expect(
      readConfig({ ...complete, OPENAI_API_KEY: "sk-proj", OPENAI_MODEL: "gpt-5" }),
    ).toMatchObject({ openAiApiKey: "sk-proj", openAiModel: "gpt-5" });
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

describe("chain configuration", () => {
  test("another chain keeps its RPC and drops the default USDC unless given", () => {
    expect(
      readConfig({ ...complete, CHAIN_ID: "8453", CHAIN_RPC_URL: "https://mainnet.base.org" }),
    ).toMatchObject({
      chainId: 8453,
      chainRpcUrl: "https://mainnet.base.org",
      usdcAddress: undefined,
    });
    expect(readConfig({ ...complete, CHAIN_ID: "8453", USDC_ADDRESS: "0xabc" })).toMatchObject({
      usdcAddress: "0xabc",
    });
    expect(readConfig({ ...complete, PRIVY_AUTHORIZATION_KEY: "key" }).privyAuthorizationKey).toBe(
      "key",
    );
  });

  test("a registry CHAIN_ID without CHAIN_RPC_URL keeps that chain's own RPC", () => {
    expect(readConfig({ ...complete, CHAIN_ID: "4801" })).toMatchObject({
      chainId: 4801,
      chainRpcUrl: "https://worldchain-sepolia.g.alchemy.com/public",
      usdcAddress: undefined,
    });
    expect(
      readConfig({ ...complete, CHAIN_ID: "4801", CHAIN_RPC_URL: "http://rpc" }),
    ).toMatchObject({ chainId: 4801, chainRpcUrl: "http://rpc" });
  });

  test("collects per-chain RPC overrides from CHAIN_RPC_URL_<id>", () => {
    expect(
      readConfig({
        ...complete,
        CHAIN_RPC_URL_4801: "https://world.example",
        CHAIN_RPC_URL_84532: "https://base.example",
        CHAIN_RPC_URL_abc: "ignored",
        CHAIN_RPC_URL_1: "",
      }).chainRpcUrls,
    ).toEqual({ 4801: "https://world.example", 84532: "https://base.example" });
  });
});
