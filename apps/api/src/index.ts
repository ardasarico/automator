import { createDatabase } from "@automator/db";
import { PrivyClient } from "@privy-io/node";
import { createOpenAiModel, createOpenRouterModel, withFallbackModel } from "./ai/client";
import { createApp } from "./app";
import { createPrivyIdentity, withE2eIdentity } from "./auth/privy";
import { createChainFactory, resolveChainSettings } from "./chain/provider";
import { readConfig } from "./config";
import { createDataFactory } from "./data/provider";
import { createQuickJsSandbox } from "./sandbox/quickjs";
import { createScheduler } from "./scheduler";
import { createSecretsCrypto } from "./secrets/crypto";
import { createSecretsResolver } from "./secrets/resolver";
import { createBalanceReader } from "./watch/balances";
import { createWorldVerifier } from "./world/verify";

const config = readConfig();
const database = createDatabase(config.databaseUrl);
await database.migrate();
const secretsCrypto = createSecretsCrypto(config.secretsKey);
const openRouter = createOpenRouterModel({
  apiKey: config.openRouterApiKey,
  model: config.openRouterModel,
});
const openAi = createOpenAiModel({ apiKey: config.openAiApiKey, model: config.openAiModel });
/*
 * OpenAI leads because speed was the failure: the configured OpenRouter model reasons before it
 * answers and measured 33-104s a call against budgets it kept losing, while gpt-4.1-mini does
 * not reason and answers in seconds. OpenRouter still catches an OpenAI outage, and either key
 * alone is a working configuration.
 */
const model =
  openAi && openRouter
    ? withFallbackModel(openAi, openRouter, (line) => console.warn(line))
    : (openAi ?? openRouter);
const identity = withE2eIdentity(
  createPrivyIdentity(config.privyAppId, config.privyAppSecret, config.privyVerificationKey),
  config.e2eTestToken,
);
const signing =
  config.privyAuthorizationKey && config.privySignerId && config.privyAppId && config.privyAppSecret
    ? {
        privy: new PrivyClient({
          appId: config.privyAppId,
          appSecret: config.privyAppSecret,
          timeout: 10_000,
          maxRetries: 0,
        }),
        authorizationKey: config.privyAuthorizationKey,
        signerId: config.privySignerId,
      }
    : undefined;
const dataFactory = createDataFactory({
  dataTables: database.dataTables,
  dataRecords: database.dataRecords,
});
const chainFactory = createChainFactory(
  resolveChainSettings(config),
  identity,
  signing,
  undefined,
  database.paymentPolicies,
);

const graph = config.graphApiKey
  ? {
      apiKey: config.graphApiKey,
      ...(config.graphGatewayUrl ? { url: config.graphGatewayUrl } : {}),
    }
  : undefined;

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
  apiKeys: database.apiKeys,
  identity,
  model,
  graph,
  chainFactory,
  aiMessages: database.aiMessages,
  dataTables: database.dataTables,
  dataRecords: database.dataRecords,
  nodePresets: database.nodePresets,
  dataFactory,
  world: createWorldVerifier(config.world),
  log: true,
  rateLimits: config.rateLimits,
  flowVersions: database.flowVersions,
  triggerIssues: database.triggerClaims,
  paymentPolicies: database.paymentPolicies,
}).listen({ hostname: "::", port: config.port });

console.log(`API listening on ${app.server?.url}`);

const scheduler = createScheduler({
  flows: database.flows,
  runs: database.runs,
  triggerClaims: database.triggerClaims,
  engine: (ownerId) => ({
    model,
    graph,
    sandbox: createQuickJsSandbox(),
    secrets: createSecretsResolver({ secrets: database.secrets, crypto: secretsCrypto }, ownerId),
  }),
  chainFactory,
  dataFactory,
  eventCursors: database.eventCursors,
  eventReaderFor: (chainId) => chainFactory.chain(chainId)?.eventReader,
  watchState: database.watchState,
  watchSources: {
    chainReaderFor: (chainId) => chainFactory.chain(chainId)?.reader,
    ...(config.tokenApiKey
      ? {
          balances: createBalanceReader({
            apiKey: config.tokenApiKey,
            ...(config.tokenApiUrl ? { baseUrl: config.tokenApiUrl } : {}),
          }),
        }
      : {}),
  },
  log: (line) => console.log(line),
});
if (config.databaseUrl) scheduler.start();

async function shutdown() {
  scheduler.stop();
  await app.stop();
  await scheduler.settle();
  await database.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
