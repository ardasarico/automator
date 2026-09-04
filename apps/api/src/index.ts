import { createDatabase } from "@automator/db";
import { createApp } from "./app";

const database = createDatabase(process.env.DATABASE_URL);
const app = createApp(database).listen({
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
