import { createDatabase } from "@automator/db";
import { PrivyClient } from "@privy-io/node";
import { createOpenRouterModel } from "./ai/client";
import { createApp } from "./app";
import { createPrivyIdentity, withE2eIdentity } from "./auth/privy";
import { createChainFactory } from "./chain/provider";
import { readConfig } from "./config";
import { createQuickJsSandbox } from "./sandbox/quickjs";
import { createScheduler } from "./scheduler";
import { createSecretsCrypto } from "./secrets/crypto";
import { createSecretsResolver } from "./secrets/resolver";

const config = readConfig();
const database = createDatabase(config.databaseUrl);
await database.migrate();
const secretsCrypto = createSecretsCrypto(config.secretsKey);
const model = createOpenRouterModel({
  apiKey: config.openRouterApiKey,
  model: config.openRouterModel,
});
const identity = withE2eIdentity(
  createPrivyIdentity(config.privyAppId, config.privyAppSecret, config.privyVerificationKey),
  config.e2eTestToken,
);
// Signing needs a Privy client of its own: the identity provider keeps its client private.
const signing =
  config.privyAuthorizationKey && config.privyAppId && config.privyAppSecret
    ? {
        privy: new PrivyClient({ appId: config.privyAppId, appSecret: config.privyAppSecret }),
        authorizationKey: config.privyAuthorizationKey,
      }
    : undefined;
const chainFactory = createChainFactory(
  {
    chainId: config.chainId,
    rpcUrl: config.chainRpcUrl,
    ...(config.usdcAddress ? { usdcAddress: config.usdcAddress as `0x${string}` } : {}),
  },
  identity,
  signing,
);

const app = createApp({
  database,
  users: database.users,
  flows: database.flows,
  runs: database.runs,
  listings: database.listings,
  secrets: database.secrets,
  secretsCrypto,
  sessions: database.sessions,
  account: database.account,
  identity,
  model,
  chainFactory,
  log: true,
}).listen({ hostname: "::", port: config.port });

console.log(`API listening on ${app.server?.url}`);

// Schedule triggers run in this process; `chainFactory` is where the onchain provider plugs in.
const scheduler = createScheduler({
  flows: database.flows,
  runs: database.runs,
  engine: (ownerId) => ({
    model,
    sandbox: createQuickJsSandbox(),
    secrets: createSecretsResolver({ secrets: database.secrets, crypto: secretsCrypto }, ownerId),
  }),
  chainFactory,
  log: (line) => console.log(line),
});
if (config.databaseUrl) scheduler.start();

async function shutdown() {
  scheduler.stop();
  await app.stop();
  await database.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
