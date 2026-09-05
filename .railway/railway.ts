import { defineRailway, github, postgres, project, service, volume } from "railway/iac";

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
        "/packages/**",
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
        "/packages/**",
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
      NODE_ENV: "production",
      PORT: "3000",
      RAILPACK_NODE_VERSION: "22",
    },
    replicas: { sfo: 1 },
  });
  const runtime = service("runtime", {
    source: github("ardasarico/automator", { branch: "main" }),
    build: {
      builder: "RAILPACK",
      buildCommand: "bun run build --filter=@automator/runtime",
      watchPatterns: [
        "/apps/runtime/**",
        "/packages/**",
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
      NODE_ENV: "production",
      PORT: "3002",
      RAILPACK_NODE_VERSION: "22",
    },
    replicas: { sfo: 1 },
  });

  return project("automator", {
    resources: [Postgres, api, web, runtime, postgresVolume],
  });
});
