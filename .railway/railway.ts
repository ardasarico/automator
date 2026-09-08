import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "sfo",
    sizeMB: 50000,
  });
  const api = service("api", {
    source: github("ardasarico/automator", { branch: "main" }),
    build: {
      builder: "RAILPACK",
      buildCommand: "bun run build --filter=@automator/api",
      watchPatterns: [
        "/apps/api/**",
        "/packages/contracts/**",
        "/packages/db/**",
        "/packages/flow-engine/**",
        "/packages/typescript-config/**",
        "/package.json",
        "/bun.lock",
        "/turbo.json",
        "/.railway/**",
      ],
    },
    start: "bun run --filter @automator/api start",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      DATABASE_URL: Postgres.env.DATABASE_URL,
      NODE_ENV: "production",
      PORT: "3001",
      RAILPACK_NODE_VERSION: "22",
      CHAIN_RPC_URL_4801: preserve(),
      CHAIN_RPC_URL_84532: preserve(),
      OPENAI_API_KEY: preserve(),
      OPENAI_MODEL: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_MODEL: preserve(),
      PRIVY_APP_ID: preserve(),
      PRIVY_APP_SECRET: preserve(),
      PRIVY_AUTHORIZATION_KEY: preserve(),
      PRIVY_SIGNER_ID: "${{web.NEXT_PUBLIC_PRIVY_SIGNER_ID}}",
      PRIVY_VERIFICATION_KEY: preserve(),
      SECRETS_KEY: preserve(),
      TOKEN_API_KEY: preserve(),
      WORLD_APP_ID: preserve(),
      WORLD_ENVIRONMENT: preserve(),
      WORLD_RP_ID: preserve(),
      WORLD_RP_SIGNING_KEY: preserve(),
    },
    replicas: { sfo: 1 },
  });
  const web = service("web", {
    source: github("ardasarico/automator", { branch: "main" }),
    networking: {
      serviceDomains: { "web-production-6245b.up.railway.app": { port: 3000 } },
    },
    build: {
      builder: "RAILPACK",
      buildCommand: "bun run build --filter=@automator/web",
      watchPatterns: [
        "/apps/web/**",
        "/packages/ui/**",
        "/packages/contracts/**",
        "/packages/api-client/**",
        "/packages/miniapp/**",
        "/packages/flow-engine/**",
        "/packages/tailwind-config/**",
        "/packages/typescript-config/**",
        "/package.json",
        "/bun.lock",
        "/turbo.json",
        "/.railway/**",
      ],
    },
    start: "bun run --filter @automator/web start",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      API_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001",
      NEXT_PUBLIC_PRIVY_APP_ID: preserve(),
      NEXT_PUBLIC_PRIVY_SIGNER_ID: preserve(),
      NEXT_PUBLIC_RUNTIME_URL: "https://runtime-production-b62a.up.railway.app",
      NODE_ENV: "production",
      PORT: "3000",
      RAILPACK_NODE_VERSION: "22",
    },
    replicas: { sfo: 1 },
  });
  const runtime = service("runtime", {
    source: github("ardasarico/automator", { branch: "main" }),
    networking: {
      serviceDomains: { "runtime-production-b62a.up.railway.app": { port: 3002 } },
    },
    build: {
      builder: "RAILPACK",
      buildCommand: "bun run build --filter=@automator/runtime",
      watchPatterns: [
        "/apps/runtime/**",
        "/packages/ui/**",
        "/packages/contracts/**",
        "/packages/api-client/**",
        "/packages/miniapp/**",
        "/packages/flow-engine/**",
        "/packages/tailwind-config/**",
        "/packages/typescript-config/**",
        "/package.json",
        "/bun.lock",
        "/turbo.json",
        "/.railway/**",
      ],
    },
    start: "bun run --filter @automator/runtime start",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      API_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001",
      NEXT_PUBLIC_PRIVY_APP_ID: preserve(),
      NODE_ENV: "production",
      PORT: "3002",
      WEB_URL: "https://web-production-6245b.up.railway.app",
      RAILPACK_NODE_VERSION: "22",
    },
    replicas: { sfo: 1 },
  });

  return project("automator", {
    resources: [Postgres, api, web, runtime, postgresVolume],
  });
});
