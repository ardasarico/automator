import {
  normalizePaymentPolicy,
  paymentPolicyProblem,
  paymentAmountToUnits,
  paymentUnitsToAmount,
  type ChainId,
  type PaymentPolicy,
  type PaymentPolicyState,
} from "@automator/contracts";
import type { SQL, TransactionSQL } from "bun";

export class PaymentPolicyDeniedError extends Error {}
export class PaymentPolicyOwnerMissingError extends Error {}
export type PaymentPolicyOperation =
  | {
      kind: "transfer";
      chainId: number;
      asset: "native" | "usdc";
      recipient: string;
      amount: string;
    }
  | { kind: "unsupported"; reason: string };
const defaultPolicy = (): PaymentPolicy => ({ enabled: false, recipients: [], limits: [] });
const uint256Max = (1n << 256n) - 1n;
type Connection = SQL | TransactionSQL;

async function lockOwner(tx: Connection, ownerId: string) {
  const rows = await tx`SELECT id FROM automator_users WHERE id = ${ownerId} FOR UPDATE`;
  if (!rows.length) throw new PaymentPolicyOwnerMissingError("Payment policy owner does not exist");
}
async function readPolicy(tx: Connection, ownerId: string): Promise<PaymentPolicy> {
  const rows = await tx<
    { policy: unknown }[]
  >`SELECT policy FROM automator_payment_policies WHERE owner_id = ${ownerId}`;
  if (!rows.length) return defaultPolicy();
  const policy = rows[0]!.policy;
  if (paymentPolicyProblem(policy))
    throw new PaymentPolicyDeniedError("Stored payment policy is invalid.");
  return policy as PaymentPolicy;
}
async function readDay(tx: Connection): Promise<string> {
  const rows = await tx<
    { day: string }[]
  >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day`;
  return rows[0]!.day;
}
async function state(
  tx: Connection,
  ownerId: string,
  policy: PaymentPolicy,
): Promise<PaymentPolicyState> {
  const day = await readDay(tx);
  const rows = await tx<{ chainId: ChainId; asset: "native" | "usdc"; reserved: string }[]>`
    SELECT chain_id AS "chainId", asset, sum(amount)::text AS reserved
    FROM automator_payment_reservations WHERE owner_id = ${ownerId} AND day = ${day}::date
    GROUP BY chain_id, asset ORDER BY chain_id, asset`;
  return {
    policy,
    day,
    usage: rows.map((row) => ({
      ...row,
      reserved: paymentUnitsToAmount(BigInt(row.reserved), row.asset),
    })),
  };
}

/** Admission is permanent: failed or uncertain signing attempts remain charged for their UTC day. */
export function createPaymentPolicyStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async get(ownerId: string): Promise<PaymentPolicyState> {
      return connection().begin(async (tx) => {
        await lockOwner(tx, ownerId);
        return state(tx, ownerId, await readPolicy(tx, ownerId));
      });
    },
    async save(ownerId: string, input: PaymentPolicy): Promise<PaymentPolicyState> {
      return connection().begin(async (tx) => {
        await lockOwner(tx, ownerId);
        const problem = paymentPolicyProblem(input);
        if (problem) throw new PaymentPolicyDeniedError(problem);
        const policy = normalizePaymentPolicy(input);
        await tx`INSERT INTO automator_payment_policies (owner_id, policy)
          VALUES (${ownerId}, ${policy}::jsonb) ON CONFLICT (owner_id)
          DO UPDATE SET policy = EXCLUDED.policy, updated_at = now()`;
        return state(tx, ownerId, policy);
      });
    },
    async reserve(ownerId: string, operation: PaymentPolicyOperation): Promise<string | null> {
      return connection().begin(async (tx) => {
        // The user row exists before settings do; policy edits and every worker share this lock.
        await lockOwner(tx, ownerId);
        const policy = await readPolicy(tx, ownerId);
        if (!policy.enabled) return null;
        if (operation.kind === "unsupported") throw new PaymentPolicyDeniedError(operation.reason);
        if (!/^(0|[1-9][0-9]{0,77})$/.test(operation.amount))
          throw new PaymentPolicyDeniedError(
            "Payment amount must be an unsigned integer in base units.",
          );
        const amount = BigInt(operation.amount);
        if (amount > uint256Max)
          throw new PaymentPolicyDeniedError("Payment amount exceeds uint256.");
        if (
          policy.recipients.length &&
          !policy.recipients.some(
            (address) => address.toLowerCase() === operation.recipient.toLowerCase(),
          )
        )
          throw new PaymentPolicyDeniedError(
            "Payment recipient is not allowed by your payment policy.",
          );
        const limit = policy.limits.find(
          (entry) => entry.chainId === operation.chainId && entry.asset === operation.asset,
        );
        if (!limit)
          throw new PaymentPolicyDeniedError(
            "This chain and asset have no configured payment limit.",
          );
        const perTransfer = paymentAmountToUnits(limit.perTransfer, limit.asset);
        const perDay = paymentAmountToUnits(limit.perDay, limit.asset);
        if (perTransfer === null || perDay === null || perTransfer <= 0n || perDay <= 0n)
          throw new PaymentPolicyDeniedError("Payment policy limits are invalid.");
        if (amount > perTransfer)
          throw new PaymentPolicyDeniedError("Payment exceeds your per-transfer limit.");
        const day = await readDay(tx);
        const rows = await tx<
          { reserved: string }[]
        >`SELECT COALESCE(sum(amount), 0)::text AS reserved
          FROM automator_payment_reservations WHERE owner_id = ${ownerId} AND day = ${day}::date
          AND chain_id = ${operation.chainId} AND asset = ${operation.asset}`;
        if (BigInt(rows[0]!.reserved) + amount > perDay)
          throw new PaymentPolicyDeniedError("Payment exceeds your daily limit (UTC).");
        const id = crypto.randomUUID();
        await tx`INSERT INTO automator_payment_reservations (id, owner_id, chain_id, asset, recipient, amount, day)
          VALUES (${id}, ${ownerId}, ${operation.chainId}, ${operation.asset}, ${operation.recipient.toLowerCase()}, ${operation.amount}::numeric, ${day}::date)`;
        return id;
      });
    },
  };
}
export type PaymentPolicyStore = ReturnType<typeof createPaymentPolicyStore>;
