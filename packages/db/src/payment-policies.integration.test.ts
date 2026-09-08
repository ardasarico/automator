import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import type { PaymentPolicy } from "@automator/contracts";
import { migrate } from "./migrations";
import {
  createPaymentPolicyStore,
  PaymentPolicyDeniedError,
  type PaymentPolicyOperation,
} from "./payment-policies";
import { createUserStore } from "./users";
const url = process.env.TEST_DATABASE_URL;
const recipient = `0x${"ab".repeat(20)}`;
const transfer = (amount: string): PaymentPolicyOperation => ({
  kind: "transfer",
  chainId: 84532,
  asset: "usdc",
  recipient,
  amount,
});
const policy: PaymentPolicy = {
  enabled: true,
  recipients: [recipient.toUpperCase().replace("0X", "0x")],
  limits: [{ chainId: 84532, asset: "usdc", perTransfer: "8", perDay: "10" }],
};
async function fixture(run: (sql: SQL, owner: string, other: SQL) => Promise<void>) {
  const sql = new SQL(url!, { max: 4 });
  const other = new SQL(url!, { max: 1 });
  const owner = `did:privy:payment-${crypto.randomUUID()}`;
  try {
    await migrate(sql);
    await createUserStore(sql).sync(owner, null);
    await run(sql, owner, other);
  } finally {
    await sql`DELETE FROM automator_users WHERE id = ${owner}`;
    await other.close();
    await sql.close();
  }
}
describe.skipIf(!url)("payment policy admission", () => {
  test("two workers cannot exceed the daily budget; reservations survive restart and policy edits", async () =>
    fixture(async (sql, owner, other) => {
      const store = createPaymentPolicyStore(sql);
      expect((await store.get(owner)).policy).toEqual({
        enabled: false,
        recipients: [],
        limits: [],
      });
      expect(
        await store.reserve(owner, { kind: "unsupported", reason: "Raw signing blocked" }),
      ).toBeNull();
      await store.save(owner, policy);
      const results = await Promise.allSettled([
        store.reserve(owner, transfer("6000000")),
        createPaymentPolicyStore(other).reserve(owner, transfer("6000000")),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const denied = results.find((result) => result.status === "rejected");
      expect(
        denied?.status === "rejected" && denied.reason instanceof PaymentPolicyDeniedError,
      ).toBe(true);
      expect((await store.get(owner)).usage).toEqual([
        { chainId: 84532, asset: "usdc", reserved: "6" },
      ]);
      await store.save(owner, { ...policy, enabled: false });
      await store.save(owner, policy);
      await expect(
        createPaymentPolicyStore(other).reserve(owner, transfer("5000000")),
      ).rejects.toThrow("daily limit");
      expect(await store.reserve(owner, transfer("4000000"))).toBeString();
    }));
  test("denies unsupported signing, recipients, chains, assets, invalid and oversized amounts", async () =>
    fixture(async (sql, owner) => {
      const store = createPaymentPolicyStore(sql);
      await store.save(owner, policy);
      await expect(
        store.reserve(owner, { kind: "unsupported", reason: "Raw signing blocked" }),
      ).rejects.toThrow("Raw signing blocked");
      await expect(
        store.reserve(owner, {
          ...transfer("1"),
          kind: "transfer",
          chainId: 84532,
          asset: "usdc",
          amount: "1",
          recipient: `0x${"cd".repeat(20)}`,
        }),
      ).rejects.toThrow("recipient");
      await expect(
        store.reserve(owner, {
          kind: "transfer",
          chainId: 4801,
          asset: "usdc",
          amount: "1",
          recipient,
        }),
      ).rejects.toThrow("chain and asset");
      await expect(
        store.reserve(owner, {
          kind: "transfer",
          chainId: 84532,
          asset: "native",
          amount: "1",
          recipient,
        }),
      ).rejects.toThrow("chain and asset");
      await expect(store.reserve(owner, transfer("8000001"))).rejects.toThrow("per-transfer");
      for (const value of ["-1", "1.2", "01", "1e3", "9".repeat(79)])
        await expect(store.reserve(owner, transfer(value))).rejects.toThrow("unsigned integer");
      await expect(store.reserve(owner, transfer((1n << 256n).toString()))).rejects.toThrow(
        "uint256",
      );
      expect((await store.get(owner)).usage).toEqual([]);
    }));
  test("exact large amounts, UTC days and chain/asset isolation", async () =>
    fixture(async (sql, owner) => {
      const store = createPaymentPolicyStore(sql);
      const large = "9007199254740993.000001";
      await store.save(owner, {
        enabled: true,
        recipients: [],
        limits: [
          { chainId: 84532, asset: "usdc", perTransfer: large, perDay: large },
          { chainId: 4801, asset: "usdc", perTransfer: "1", perDay: "1" },
          { chainId: 84532, asset: "native", perTransfer: "1", perDay: "1" },
        ],
      });
      await store.reserve(owner, transfer("9007199254740993000001"));
      await expect(store.reserve(owner, transfer("1"))).rejects.toThrow("daily limit");
      await store.reserve(owner, {
        kind: "transfer",
        chainId: 4801,
        asset: "usdc",
        recipient,
        amount: "1000000",
      });
      await store.reserve(owner, {
        kind: "transfer",
        chainId: 84532,
        asset: "native",
        recipient,
        amount: "1000000000000000000",
      });
      expect(
        (await store.get(owner)).usage.find(
          (entry) => entry.chainId === 84532 && entry.asset === "usdc",
        )?.reserved,
      ).toBe(large);
      const [{ day }] = await sql<
        { day: string }[]
      >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day`;
      expect((await store.get(owner)).day).toBe(day!);
      await sql`UPDATE automator_payment_reservations SET day = day - 1 WHERE owner_id = ${owner}`;
      expect((await store.get(owner)).usage).toEqual([]);
      expect(await store.reserve(owner, transfer("1"))).toBeString();
    }));
  test("policy edits and admissions serialize on the same owner row", async () =>
    fixture(async (sql, owner, other) => {
      const store = createPaymentPolicyStore(sql);
      await store.save(owner, policy);
      const [{ pid }] = await other<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      let admission: Promise<{ error?: unknown }> | undefined;
      try {
        await sql.begin(async (tx) => {
          await tx`SELECT id FROM automator_users WHERE id = ${owner} FOR UPDATE`;
          await tx`UPDATE automator_payment_policies SET policy = ${{ ...policy, limits: [{ ...policy.limits[0]!, chainId: 4801 }] }}::jsonb WHERE owner_id = ${owner}`;
          admission = createPaymentPolicyStore(other)
            .reserve(owner, transfer("1"))
            .then(
              () => ({}),
              (error: unknown) => ({ error }),
            );
          // This pool has one connection: its backend must visibly wait for our row lock.
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            const rows = await sql<{ blocked: boolean }[]>`
              SELECT wait_event_type = 'Lock' AS blocked FROM pg_stat_activity WHERE pid = ${pid!}`;
            if (rows[0]?.blocked) return;
          }
          throw new Error("Competing payment admission did not wait for the owner row lock");
        });
      } finally {
        // Let a failed assertion roll back before awaiting the worker and fixture cleanup.
        await admission;
      }
      const result = await admission!;
      expect(result.error).toBeInstanceOf(PaymentPolicyDeniedError);
      expect((result.error as Error).message).toContain("chain and asset");
    }));
  test("corrupt stored settings cannot disable enforcement or escape through reads", async () =>
    fixture(async (sql, owner) => {
      const store = createPaymentPolicyStore(sql);
      await store.save(owner, policy);
      await sql`UPDATE automator_payment_policies SET policy = ${{ recipients: [], limits: [] }}::jsonb WHERE owner_id = ${owner}`;
      await expect(store.reserve(owner, transfer("1"))).rejects.toThrow(
        "Stored payment policy is invalid",
      );
      await expect(store.get(owner)).rejects.toThrow("Stored payment policy is invalid");
      await store.save(owner, { enabled: false, recipients: [], limits: [] });
      expect(await store.reserve(owner, transfer("1"))).toBeNull();
    }));
});
