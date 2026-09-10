import { getChain } from "@automator/contracts";
import { defaultRateLimits, type RateLimits } from "./rate-limit";
import { generateSecretsKey, parseSecretsKey } from "./secrets/crypto";
import { readWorldConfig, type WorldConfig } from "./world/verify";

export interface ApiConfig {
  port: number;
  databaseUrl: string | undefined;
  privyAppId: string | undefined;
  privyAppSecret: string | undefined;
  /* Local verification avoids JWKS outages, which Privy reports like invalid signatures. */
  privyVerificationKey: string | undefined;
  openRouterApiKey: string | undefined;
  openRouterModel: string;
  openAiApiKey: string | undefined;
  openAiModel: string;
  tokenApiKey: string | undefined;
  tokenApiUrl: string | undefined;
  graphApiKey: string | undefined;
  graphGatewayUrl: string | undefined;
  /* 32-byte base64 encryption key. Development generates an ephemeral key when absent. */
  secretsKey: Buffer;
  chainId: number;
  chainRpcUrl: string;
  usdcAddress: string | undefined;
  chainRpcUrls: Record<string, string>;
  privyAuthorizationKey: string | undefined;
  privySignerId: string | undefined;
  world: WorldConfig | undefined;
  e2eTestToken: string | undefined;
  rateLimits: RateLimits;
}

export const defaultChainId = 84532;
export const defaultRpcUrl = "https://sepolia.base.org";
export const defaultUsdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const defaultOpenRouterModel = "openai/gpt-oss-120b";

/*
 * Chosen 2026-09-10 on partial evidence — say so, because it was a judgement call and not a
 * completed evaluation. Luna was measured on one prompt only (the onchain one), 8 runs: 7 flows
 * that passed their checks outright and 1 delivered with a failed check, so 8/8 produced a usable
 * document. On that same prompt gpt-4.1-mini produced nothing usable in 10 of 10, and gpt-4.1
 * produced a document 10 of 10 but every one failed its checks. Webhook, mini-app and data cells
 * were never run for luna.
 *
 * Cost, measured against the real system prompt rather than taken from a price list: 7,782 prompt
 * and 1,200 completion tokens a call, 512 of the completion spent on reasoning, which bills at the
 * dearer rate — about $0.0030 a call against gpt-4.1's $0.0216. Roughly seven times cheaper, not
 * the ten the sticker prices suggest. A model call takes ~14s against gpt-4.1's ~3.5s.
 *
 * Before swapping this: gpt-5-family models reject an explicit temperature, which every ai.* node
 * sends. `client.ts` handles that by asking again without one — read that comment first.
 */
export const defaultOpenAiModel = "gpt-5.6-luna";

const required = [
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_VERIFICATION_KEY",
  "SECRETS_KEY",
] as const;

export function readConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    const message = `Missing environment variables: ${missing.join(", ")}`;
    if (env.NODE_ENV === "production") throw new Error(message);
    console.warn(`${message}. The API starts with those features unavailable.`);
  }
  if (!env.PRIVY_VERIFICATION_KEY && env.NODE_ENV !== "production")
    console.warn("Privy verification key not set; JWKS fetch failures will surface as 401.");
  if (env.E2E_TEST_TOKEN && env.NODE_ENV === "production")
    throw new Error("E2E_TEST_TOKEN must not be set in production");
  let secretsKey = parseSecretsKey(env.SECRETS_KEY);
  if (!secretsKey) {
    const message = env.SECRETS_KEY
      ? "SECRETS_KEY must be 32 bytes in base64."
      : "SECRETS_KEY is not set.";
    if (env.NODE_ENV === "production") throw new Error(message);
    console.warn(
      `${message} Using a key generated for this process; stored secrets will not outlive it.`,
    );
    secretsKey = parseSecretsKey(generateSecretsKey())!;
  }
  const perMinute = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    port: Number(env.PORT) || 3001,
    databaseUrl: env.DATABASE_URL,
    privyAppId: env.PRIVY_APP_ID,
    privyAppSecret: env.PRIVY_APP_SECRET,
    privyVerificationKey: env.PRIVY_VERIFICATION_KEY,
    openRouterApiKey: env.OPENROUTER_API_KEY || undefined,
    openRouterModel: env.OPENROUTER_MODEL || defaultOpenRouterModel,
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    tokenApiKey: env.TOKEN_API_KEY || undefined,
    tokenApiUrl: env.TOKEN_API_URL || undefined,
    graphApiKey: env.GRAPH_API_KEY || undefined,
    graphGatewayUrl: env.GRAPH_GATEWAY_URL || undefined,
    openAiModel: env.OPENAI_MODEL || defaultOpenAiModel,
    chainId: Number(env.CHAIN_ID) || defaultChainId,
    chainRpcUrl:
      env.CHAIN_RPC_URL ||
      getChain(Number(env.CHAIN_ID) || defaultChainId)?.rpcUrl ||
      defaultRpcUrl,
    usdcAddress:
      env.USDC_ADDRESS || (Number(env.CHAIN_ID) || defaultChainId) === defaultChainId
        ? env.USDC_ADDRESS || defaultUsdcAddress
        : undefined,
    chainRpcUrls: readChainRpcUrls(env),
    privyAuthorizationKey: env.PRIVY_AUTHORIZATION_KEY || undefined,
    privySignerId: env.PRIVY_SIGNER_ID || undefined,
    world: readWorldConfig(env),
    e2eTestToken: env.E2E_TEST_TOKEN || undefined,
    secretsKey,
    rateLimits: {
      runs: perMinute(env.RATE_LIMIT_RUNS, defaultRateLimits.runs),
      data: perMinute(env.RATE_LIMIT_DATA, defaultRateLimits.data),
      ai: perMinute(env.RATE_LIMIT_AI, defaultRateLimits.ai),
      secrets: perMinute(env.RATE_LIMIT_SECRETS, defaultRateLimits.secrets),
      sessions: perMinute(env.RATE_LIMIT_SESSIONS, defaultRateLimits.sessions),
      webhooks: perMinute(env.RATE_LIMIT_WEBHOOKS, defaultRateLimits.webhooks),
      api: perMinute(env.RATE_LIMIT_API, defaultRateLimits.api),
    },
  };
}

function readChainRpcUrls(env: Record<string, string | undefined>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const match = /^CHAIN_RPC_URL_(\d+)$/.exec(name);
    if (match && value) urls[match[1]!] = value;
  }
  return urls;
}
