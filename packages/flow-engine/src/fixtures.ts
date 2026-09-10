import type { FlowNodeType } from "@automator/contracts";

/*
 * Canned outputs shaped like the ones the real executors return, for callers that need a flow to
 * run without touching a service — automatic checks on an AI proposal, above all. Standing in for
 * an executor lets the rest of the flow actually run: templates resolve or fail, both branches of
 * a condition become reachable, and a comparison against a balance is really made.
 *
 * What they prove is wiring, never behaviour. A check backed by these says the flow is put
 * together correctly, not that a transfer would succeed or an email would arrive.
 *
 * Two rules for anything added here. Mirror the executor's own shape — these live beside the
 * executors so the two can be read together, and a field that does not exist in reality would
 * make a check pass on a flow that breaks live. And keep every value plausible and consistent
 * with its neighbours: `formatted` is `raw` at the token's decimals, `simulated` matches what a
 * dry run sets, an address is a real-looking address.
 */

/** A checksummed burn-adjacent address: recognisable as a fixture, valid everywhere an address goes. */
const walletAddress = "0x1111111111111111111111111111111111111111";
const recipientAddress = "0x2222222222222222222222222222222222222222";
/** Base Sepolia USDC, the token the usdc.* executors resolve for the default chain. */
const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const transactionHash = "0x3d0f2b1a9c8e7d6b5a4c3e2f1d0b9a8c7e6d5f4a3b2c1d0e9f8a7b6c5d4e3f2a";
const blockHash = "0x9f8e7d6c5b4a39281706f5e4d3c2b1a09876543210fedcba9876543210fedcba";

/** 12.5 USDC: six decimals, so raw and formatted agree the way the executor computes them. */
const balanceRaw = "12500000";
const balanceFormatted = "12.5";

/*
 * A completed write, not a dry run. `performWrite` only puts `hash` on the receipt once the
 * transaction is sent, and a flow that emails its transaction hash is ordinary — a dry-run
 * fixture would have no `hash` and would fail that flow's checks for a field it really does get.
 * What the checks model is the run the user is building towards, so `simulated` is false.
 */
const writeReceipt = {
  simulated: false,
  hash: transactionHash,
  status: "success",
  gas: "21000",
} as const;

const transferReceipt = {
  token: usdcAddress,
  to: recipientAddress,
  amount: "1",
  ...writeReceipt,
} as const;

/**
 * The output a node type stands in with, keyed by handle exactly as its executor returns it. A
 * type that is absent has no fixture and stays unexercised — see `nodeFixture`.
 */
export const nodeFixtures: Partial<Record<FlowNodeType, Record<string, unknown>>> = {
  "usdc.balance": {
    balance: { address: walletAddress, raw: balanceRaw, formatted: balanceFormatted },
  },
  "usdc.payment": { receipt: transferReceipt },
  "usdc.payout": { receipt: transferReceipt },
  "onchain.transfer-token": { receipt: transferReceipt },
  "onchain.write-contract": { receipt: writeReceipt },
  "onchain.read-contract": { result: balanceRaw },
  "onchain.sign-message": {
    signature: `${transactionHash}${blockHash.slice(2)}1b`,
  },
  "privy.wallet": {
    wallet: { address: walletAddress, chainId: 84532, chainName: "Base Sepolia" },
  },
  "privy.sign-transaction": { signed: `${transactionHash}${blockHash.slice(2)}1c` },
  "privy.login": {
    user: {
      userId: "did:privy:fixture",
      email: "visitor@example.com",
      wallet: walletAddress,
      loginMethod: "email",
    },
  },
  "world.id-verify": {
    verified: {
      nullifierHash: blockHash,
      verificationLevel: "orb",
      action: "verify",
    },
  },
  "notify.email": { sent: { id: "fixture-email", to: ["visitor@example.com"] } },
  "notify.discord": { sent: { messageId: "fixture-message", channelId: "fixture-channel" } },
  "notify.telegram": { sent: { messageId: "fixture-message", chatId: "fixture-chat" } },
  "ai.generate-text": { text: "A sample answer from the model." },
  "ai.classify": { label: "sample", sample: "A sample answer from the model." },
  "ai.extract": { data: { sample: "A sample answer from the model." } },
  "ai.agent": { result: "A sample answer from the model.", steps: [] },
};

/** Enough of a data table to shape a record: the account's real columns for that table. */
export interface FixtureTable {
  id: string;
  columns: readonly { id: string; type: string }[];
}

const fixtureTimestamp = "2026-09-10T12:00:00.000Z";

/** A value of the column's own type, so a condition on it compares instead of refusing. */
function columnValue(type: string): unknown {
  switch (type) {
    case "number":
      return 42;
    case "checkbox":
      return true;
    case "datetime":
      return fixtureTimestamp;
    case "address":
      return walletAddress;
    default:
      return "Sample";
  }
}

/*
 * A record's fields are the account's own columns, so this is built from the table the node
 * names rather than guessed. Invented columns would pass a flow that breaks live and missing
 * ones would fail a flow that works; the real column list is neither. A node naming a table
 * that does not exist gets no fixture and stays fail-closed, which is the honest answer for it.
 */
function recordFixture(table: FixtureTable): Record<string, unknown> {
  return {
    id: "simulated",
    tableId: table.id,
    values: Object.fromEntries(
      table.columns.map((column) => [column.id, columnValue(column.type)]),
    ),
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
    simulated: true,
  };
}

const dataTypes = new Set<FlowNodeType>([
  "data.create-record",
  "data.find-records",
  "data.update-record",
  "data.delete-record",
]);

/** Whether a node type can be stood in for at all, before its config is known. */
export function hasFixture(type: FlowNodeType): boolean {
  return nodeFixtures[type] !== undefined || dataTypes.has(type);
}

/**
 * The canned output for a node type, or undefined when there is none.
 *
 * `data.*` needs the owner's tables to shape its record, so it answers only when the table the
 * node names is among them.
 */
export function nodeFixture(
  type: FlowNodeType,
  config?: Record<string, unknown>,
  tables: readonly FixtureTable[] = [],
): Record<string, unknown> | undefined {
  if (dataTypes.has(type)) {
    const table = tables.find((candidate) => candidate.id === config?.tableId);
    if (table === undefined) return undefined;
    const record = recordFixture(table);
    /* One match, never none: an empty result would leave every downstream branch untestable. */
    return type === "data.find-records"
      ? { found: { records: [record], count: 1, first: record } }
      : { record };
  }
  const fixture = nodeFixtures[type];
  if (fixture === undefined) return undefined;
  const copy = structuredClone(fixture);
  /* Classify names its own output after the label it picked, so the fixture picks a real one. */
  if (type === "ai.classify") {
    const labels = Array.isArray(config?.labels) ? config.labels : [];
    const first = labels.find((label) => typeof label === "string" && label.trim() !== "");
    const chosen = typeof first === "string" ? first : "sample";
    return { [chosen]: copy.sample, label: chosen };
  }
  return copy;
}
