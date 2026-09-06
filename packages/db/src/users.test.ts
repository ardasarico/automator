import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { createUserStore, UsernameTakenError } from "./users";

test("Bun PostgreSQL unique violations become a username conflict", async () => {
  // Bun exposes SQLSTATE on errno; code identifies the generic driver error.
  const conflict = Object.assign(new Error("duplicate key"), {
    code: "ERR_POSTGRES_SERVER_ERROR",
    errno: "23505",
  });
  const sql = (() => Promise.reject(conflict)) as unknown as SQL;
  await expect(
    createUserStore(sql).saveProfile("did:privy:test", { name: "Test", username: "taken" }),
  ).rejects.toBeInstanceOf(UsernameTakenError);
});

test("other database failures are not reported as username conflicts", async () => {
  const failure = Object.assign(new Error("unavailable"), {
    code: "ERR_POSTGRES_CONNECTION_TIMEOUT",
  });
  const sql = (() => Promise.reject(failure)) as unknown as SQL;
  await expect(
    createUserStore(sql).saveProfile("did:privy:test", { name: "Test", username: "valid_name" }),
  ).rejects.toBe(failure);
});

test("re-syncing without a wallet keeps the address already stored", async () => {
  let statement = "";
  const sql = ((strings: TemplateStringsArray) => {
    statement = strings.join("?");
    return Promise.resolve([
      { id: "did:privy:test", name: null, username: null, walletAddress: "0xkept" },
    ]);
  }) as unknown as SQL;

  expect(await createUserStore(sql).sync("did:privy:test", null)).toMatchObject({
    walletAddress: "0xkept",
  });
  expect(statement.replace(/\s+/g, " ")).toContain(
    "wallet_address = COALESCE(EXCLUDED.wallet_address, automator_users.wallet_address)",
  );
});
