import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createSessionStore, type MiniAppSessionRow, type VisitorPaymentRow } from "./sessions";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

/* A fresh transaction hash per use: the table's whole point is that one is spendable only once. */
function hash(): string {
  return `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
}

describe.skipIf(!url)("visitor payments", () => {
  async function fixture() {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:payment-${crypto.randomUUID()}`;
    await migrate(sql);
    await createUserStore(sql).sync(ownerId, null);
    const { flow } = await createFlowStore(sql).create(ownerId, {
      version: 1,
      name: "Paid report",
      description: "",
      nodes: [],
      edges: [],
    });
    const sessions = createSessionStore(sql);
    const row: MiniAppSessionRow = {
      id: crypto.randomUUID(),
      flowId: flow.id,
      ownerId,
      tokenHash: `hash-${crypto.randomUUID()}`,
      status: "screen",
      nodeId: "pay",
      variables: {},
      payload: {},
      lastRunId: crypto.randomUUID(),
      worldNonce: null,
      worldExpiresAt: null,
    };
    await sessions.create(row);
    const payment = (over: Partial<VisitorPaymentRow> = {}): VisitorPaymentRow => ({
      id: crypto.randomUUID(),
      flowId: flow.id,
      sessionId: row.id,
      runId: row.lastRunId,
      chainId: 84532,
      txHash: hash(),
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      amountUnits: "12500000",
      ...over,
    });
    return { sql, sessions, row, payment };
  }

  test("records the transfer and claims the screen in one step", async () => {
    const { sql, sessions, row, payment } = await fixture();
    try {
      const made = payment();
      expect(await sessions.claimWithPayment(row, made)).toBe("claimed");
      const [stored] = await sql<{ tx_hash: string; amount_units: string }[]>`
        SELECT tx_hash, amount_units FROM automator_payments WHERE session_id = ${row.id}`;
      expect(stored).toMatchObject({ tx_hash: made.txHash, amount_units: "12500000" });
      expect((await sessions.find(row.flowId, row.id))?.status).toBe("failed");
    } finally {
      await sql.close();
    }
  });

  test("refuses the same transfer twice, on any session, and claims nothing", async () => {
    const { sql, sessions, row, payment } = await fixture();
    try {
      const spend = hash();
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend }))).toBe("claimed");
      await sessions.update(row.id, { ...row, status: "screen" });
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend }))).toBe("spent");
      // The same hash written with different casing is the same transfer.
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend.toUpperCase() }))).toBe(
        "spent",
      );
      expect((await sessions.find(row.flowId, row.id))?.status).toBe("screen");
      const rows = await sql`SELECT id FROM automator_payments WHERE tx_hash = ${spend}`;
      expect(rows).toHaveLength(1);
    } finally {
      await sql.close();
    }
  });

  test("writes no payment when the screen was already claimed by someone else", async () => {
    const { sql, sessions, row, payment } = await fixture();
    try {
      expect(await sessions.claim(row)).toBe(true);
      const spend = hash();
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend }))).toBe("lost");
      const rows = await sql`SELECT id FROM automator_payments WHERE tx_hash = ${spend}`;
      expect(rows).toHaveLength(0);
    } finally {
      await sql.close();
    }
  });

  test("keeps the same transfer hash apart on two different chains", async () => {
    const { sql, sessions, row, payment } = await fixture();
    try {
      const spend = hash();
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend }))).toBe("claimed");
      await sessions.update(row.id, { ...row, status: "screen" });
      expect(await sessions.claimWithPayment(row, payment({ txHash: spend, chainId: 4801 }))).toBe(
        "claimed",
      );
    } finally {
      await sql.close();
    }
  });
});
