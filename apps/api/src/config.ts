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
}

const required = [
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_VERIFICATION_KEY",
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
  return {
    port: Number(env.PORT) || 3001,
    databaseUrl: env.DATABASE_URL,
    privyAppId: env.PRIVY_APP_ID,
    privyAppSecret: env.PRIVY_APP_SECRET,
    privyVerificationKey: env.PRIVY_VERIFICATION_KEY,
  };
}
