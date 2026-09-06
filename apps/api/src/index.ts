import { createDatabase } from "@automator/db";
import { createApp } from "./app";
import { createPrivyIdentity } from "./auth/privy";

const database = createDatabase(process.env.DATABASE_URL);
await database.migrate();
const app = createApp(database, {
  users: database.users,
  identity: createPrivyIdentity(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET),
}).listen({
  hostname: "::",
  port: Number(process.env.PORT ?? 3001),
});

console.log(`API listening on ${app.server?.url}`);

async function shutdown() {
  await app.stop();
  await database.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
