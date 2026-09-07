import { getChain } from "@automator/contracts";
import { defaultRateLimits, type RateLimits } from "./rate-limit";
import { generateSecretsKey, parseSecretsKey } from "./secrets/crypto";
import { readWorldConfig, type WorldConfig } from "./world/verify";

export interface ApiConfig {
  port: number;
  databaseUrl: string | undefined;
  privyAppId: string | undefined;
  privyAppSecret: string | undefined;
  /**
   * Public verification key from the Privy dashboard. When set, the SDK verifies
   * tokens locally and never fetches JWKS. A failed JWKS fetch is indistinguishable
   * from a forged token, so without this key an upstream outage logs users out.
   */
  privyVerificationKey: string | undefined;
  /** OpenRouter credentials for AI nodes and flow generation; optional in every environment. */
  openRouterApiKey: string | undefined;
  openRouterModel: string;
  /**
   * 32-byte base64 key that encrypts user secrets at rest. Required in production;
   * development without one gets a key generated at startup, so stored secrets do not
   * survive a restart there.
   */
  secretsKey: Buffer;
  /**
   * The legacy single-chain override: `CHAIN_RPC_URL` and `USDC_ADDRESS` apply to the registry
   * chain `CHAIN_ID` names (Base Sepolia by default); see `resolveChainSettings`.
   */
  chainId: number;
  chainRpcUrl: string;
  usdcAddress: string | undefined;
  /** Per-chain RPC overrides from `CHAIN_RPC_URL_<chain id>`, keyed by chain id. */
  chainRpcUrls: Record<string, string>;
  /** Privy authorization key (base64 PKCS8) that signs with users' delegated embedded wallets. */
  privyAuthorizationKey: string | undefined;
  /**
   * World ID for `world.id-verify` nodes: the Developer Portal app, its relying party and
   * signing key, and the environment proofs are made in. Optional in every environment;
   * without it those nodes fail their run as unconfigured.
   */
  world: WorldConfig | undefined;
  /**
   * A bearer token the API accepts as a fixed test user, for end-to-end tests only. Refused
   * in production, since it bypasses Privy.
   */
  e2eTestToken: string | undefined;
  /** Calls per minute before 429, per user, client address or flow; see `rate-limit.ts`. */
  rateLimits: RateLimits;
}

/** A free model that handles tools and JSON-schema answers; paid ones can be set per environment. */
export const defaultChainId = 84532;
export const defaultRpcUrl = "https://sepolia.base.org";
export const defaultUsdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const defaultOpenRouterModel = "minimax/minimax-m3:free";

const required = [
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_VERIFICATION_KEY",
  "SECRETS_KEY",
] as const;

/**
 * Reads the environment once. Production refuses to start without its
 * credentials; development runs degraded so the UI can be worked on offline.
 */
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
    chainId: Number(env.CHAIN_ID) || defaultChainId,
    // Without CHAIN_RPC_URL the named chain keeps its own public RPC, never Base Sepolia's.
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
    world: readWorldConfig(env),
    e2eTestToken: env.E2E_TEST_TOKEN || undefined,
    secretsKey,
    rateLimits: {
      runs: perMinute(env.RATE_LIMIT_RUNS, defaultRateLimits.runs),
      ai: perMinute(env.RATE_LIMIT_AI, defaultRateLimits.ai),
      secrets: perMinute(env.RATE_LIMIT_SECRETS, defaultRateLimits.secrets),
      sessions: perMinute(env.RATE_LIMIT_SESSIONS, defaultRateLimits.sessions),
      webhooks: perMinute(env.RATE_LIMIT_WEBHOOKS, defaultRateLimits.webhooks),
    },
  };
}

/** `CHAIN_RPC_URL_4801=https://...` overrides one chain's RPC; blank or non-numeric ids are ignored. */
function readChainRpcUrls(env: Record<string, string | undefined>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const match = /^CHAIN_RPC_URL_(\d+)$/.exec(name);
    if (match && value) urls[match[1]!] = value;
  }
  return urls;
}
