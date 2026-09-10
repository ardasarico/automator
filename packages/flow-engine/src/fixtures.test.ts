import { flowNodePorts, type FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { formatUnits, isAddress } from "viem";
import { defaultExecutors } from "./executors";
import { hasFixture, nodeFixture, nodeFixtures } from "./fixtures";

const entries = Object.entries(nodeFixtures) as [FlowNodeType, Record<string, unknown>][];

describe("node fixtures", () => {
  /*
   * Fields the executor really returns that are not connectable handles: nothing can be wired to
   * them, but a template may still read them. Anything else keyed on a name the node does not
   * have is a typo, and a typo'd handle is a fixture that silently never arrives anywhere.
   */
  const extraFields: Partial<Record<FlowNodeType, readonly string[]>> = {
    "ai.classify": ["sample"],
    "ai.agent": ["steps"],
  };

  test("every fixture answers on handles the node actually has", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [type, fixture] of entries) {
      const known = [...flowNodePorts[type].outputs, ...(extraFields[type] ?? [])];
      for (const handle of Object.keys(fixture))
        expect(`${type}.${handle}`).toBe(
          `${type}.${known.includes(handle) ? handle : known.join("|")}`,
        );
      /* And it has to reach a handle, or the flow after it never sees anything. */
      expect(
        Object.keys(fixture).some((handle) => flowNodePorts[type].outputs.includes(handle)),
      ).toBe(true);
    }
  });

  test("only stands in for node types that have an executor to stand in for", () => {
    for (const [type] of entries) expect(defaultExecutors[type]).toBeDefined();
  });

  test("the balance's formatted amount is its raw amount at USDC's six decimals", () => {
    const balance = nodeFixture("usdc.balance")!.balance as Record<string, string>;
    expect(formatUnits(BigInt(balance.raw!), 6)).toBe(balance.formatted!);
    expect(isAddress(balance.address!)).toBe(true);
  });

  test("receipts are shaped like a completed write, so a flow reading the hash still checks out", () => {
    for (const type of ["usdc.payout", "onchain.transfer-token"] as const) {
      const receipt = nodeFixture(type)!.receipt as Record<string, unknown>;
      expect(isAddress(String(receipt.to))).toBe(true);
      expect(isAddress(String(receipt.token))).toBe(true);
      expect(receipt.hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(receipt.simulated).toBe(false);
      expect(Number(receipt.amount)).toBeGreaterThan(0);
    }
  });

  test("a collected payment names a real transfer between two real addresses", () => {
    const paid = nodeFixture("usdc.payment")!.paid as Record<string, unknown>;
    expect(paid.paid).toBe(true);
    expect(isAddress(String(paid.from))).toBe(true);
    expect(isAddress(String(paid.to))).toBe(true);
    expect(paid.from).not.toBe(paid.to);
    expect(paid.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Number(paid.amount)).toBeGreaterThan(0);
  });

  test("addresses and identity values are real-looking, not placeholders", () => {
    const wallet = nodeFixture("privy.wallet")!.wallet as Record<string, unknown>;
    expect(isAddress(String(wallet.address))).toBe(true);
    expect(wallet.chainId).toBe(84532);
    const user = nodeFixture("privy.login")!.user as Record<string, unknown>;
    expect(String(user.email)).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(isAddress(String(user.wallet))).toBe(true);
  });

  const signups = {
    id: "tbl-signups",
    columns: [
      { id: "email", type: "text" },
      { id: "amount", type: "number" },
      { id: "joined", type: "datetime" },
      { id: "wallet", type: "address" },
    ],
  };

  test("a data record carries the table's own columns, not invented ones", () => {
    const created = nodeFixture("data.create-record", { tableId: "tbl-signups" }, [signups])!;
    const record = created.record as Record<string, unknown>;
    expect(record.tableId).toBe("tbl-signups");
    expect(record.simulated).toBe(true);
    /* Each column answers in its own type, so a condition on it compares instead of refusing. */
    expect(record.values).toEqual({
      email: "Sample",
      amount: 42,
      joined: "2026-09-10T12:00:00.000Z",
      wallet: "0x1111111111111111111111111111111111111111",
    });
  });

  test("finding records answers with a match, never an empty list", () => {
    /* An empty result would leave every downstream branch untestable — the same hole one level down. */
    const found = nodeFixture("data.find-records", { tableId: "tbl-signups" }, [signups])!
      .found as Record<string, unknown>;
    expect(found.count).toBe(1);
    expect((found.records as unknown[]).length).toBe(1);
    expect(found.first).toEqual((found.records as unknown[])[0]!);
  });

  test("a table the account does not have gets no fixture and stays fail-closed", () => {
    for (const type of [
      "data.create-record",
      "data.find-records",
      "data.update-record",
      "data.delete-record",
    ] as const) {
      expect(hasFixture(type)).toBe(true);
      expect(nodeFixture(type, { tableId: "tbl-invented" }, [signups])).toBeUndefined();
      expect(nodeFixture(type)).toBeUndefined();
    }
  });

  test("classify answers on the label it was configured with", () => {
    const configured = nodeFixture("ai.classify", { labels: ["", "urgent", "normal"] })!;
    expect(configured.label).toBe("urgent");
    expect(configured.urgent).toBeString();
    /* No labels configured is still a usable answer rather than an empty handle. */
    expect(nodeFixture("ai.classify")!.label).toBe("sample");
  });

  test("a caller cannot mutate the fixture the next caller receives", () => {
    const first = nodeFixture("usdc.balance")!;
    (first.balance as Record<string, unknown>).formatted = "0";
    expect((nodeFixture("usdc.balance")!.balance as Record<string, string>).formatted).toBe("12.5");
  });

  test("an unknown node type simply has nothing to stand in with", () => {
    expect(nodeFixture("logic.condition")).toBeUndefined();
    expect(nodeFixture("trigger.manual")).toBeUndefined();
  });
});
