import { createDatabase } from "@automator/db";
import { PrivyClient } from "@privy-io/node";
import { createOpenAiModel, createOpenRouterModel, withFallbackModel } from "./ai/client";
import { createApp } from "./app";
import { createPrivyIdentity, withE2eIdentity } from "./auth/privy";
import { createChainFactory, resolveChainSettings } from "./chain/provider";
import { readConfig } from "./config";
import { createQuickJsSandbox } from "./sandbox/quickjs";
import { createScheduler } from "./scheduler";
import { createSecretsCrypto } from "./secrets/crypto";
import { createSecretsResolver } from "./secrets/resolver";
import { createWorldVerifier } from "./world/verify";

const config = readConfig();
const database = createDatabase(config.databaseUrl);
await database.migrate();
const secretsCrypto = createSecretsCrypto(config.secretsKey);
// OpenRouter first (free models when configured so), OpenAI when it fails or is not configured.
const openRouter = createOpenRouterModel({
  apiKey: config.openRouterApiKey,
  model: config.openRouterModel,
});
const openAi = createOpenAiModel({ apiKey: config.openAiApiKey, model: config.openAiModel });
const model =
  openRouter && openAi
    ? withFallbackModel(openRouter, openAi, (line) => console.warn(line))
    : (openRouter ?? openAi);
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
// Every registry chain, with the environment's RPC overrides; a run picks its flow's chain.
const chainFactory = createChainFactory(resolveChainSettings(config), identity, signing);

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
  world: createWorldVerifier(config.world),
  log: true,
  rateLimits: config.rateLimits,
  flowVersions: database.flowVersions,
}).listen({ hostname: "::", port: config.port });

console.log(`API listening on ${app.server?.url}`);

// Schedule and onchain-event triggers run in this process, on the flow's own chain.
const scheduler = createScheduler({
  flows: database.flows,
  runs: database.runs,
  engine: (ownerId) => ({
    model,
    sandbox: createQuickJsSandbox(),
    secrets: createSecretsResolver({ secrets: database.secrets, crypto: secretsCrypto }, ownerId),
  }),
  chainFactory,
  eventCursors: database.eventCursors,
  eventReaderFor: (chainId) => chainFactory.chain(chainId)?.eventReader,
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
