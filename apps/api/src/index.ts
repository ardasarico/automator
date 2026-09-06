import { createDatabase } from "@automator/db";
import { createApp } from "./app";
import { createPrivyIdentity } from "./auth/privy";
import { readConfig } from "./config";

const config = readConfig();
const database = createDatabase(config.databaseUrl);
await database.migrate();

const app = createApp({
  database,
  users: database.users,
  identity: createPrivyIdentity(
    config.privyAppId,
    config.privyAppSecret,
    config.privyVerificationKey,
  ),
  log: true,
}).listen({ hostname: "::", port: config.port });

console.log(`API listening on ${app.server?.url}`);

async function shutdown() {
  await app.stop();
  await database.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
