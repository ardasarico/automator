import {
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

const transferEventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

interface TokenTransfer {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
}

export interface PaymentReceipt {
  status: "success" | "reverted";
  /** Every ERC-20 `Transfer` the transaction emitted, in log order. */
  transfers: TokenTransfer[];
}

export interface PaymentReader {
  /** The receipt once it lands, or null while it is still pending after `timeoutMs`. */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<PaymentReceipt | null>;
}

export interface ExpectedPayment {
  token: Address;
  from: Address;
  to: Address;
  units: bigint;
}

/** Why a transfer is not the payment this screen asked for. Never shown to a visitor verbatim. */
export type PaymentVerdict = { ok: true } | { ok: false; reason: string };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Whether a transaction is the payment a `usdc.payment` screen asked for. The transaction has to
 * have succeeded and to carry exactly one transfer of the app's token, for the exact amount, to
 * the recipient the screen resolved, from the wallet of the signed-in visitor answering it — so a
 * visitor cannot answer with somebody else's transfer, or with one that paid a different address.
 */
export function checkVisitorPayment(
  receipt: PaymentReceipt,
  expected: ExpectedPayment,
): PaymentVerdict {
  if (receipt.status !== "success")
    return { ok: false, reason: "The payment transaction did not succeed" };
  const paid = receipt.transfers.filter((transfer) => sameAddress(transfer.token, expected.token));
  if (paid.length === 0)
    return { ok: false, reason: "The transaction did not transfer this app's payment token" };
  if (paid.length > 1) return { ok: false, reason: "The transaction made more than one payment" };
  const transfer = paid[0]!;
  if (!sameAddress(transfer.to, expected.to))
    return { ok: false, reason: "The payment went to a different address" };
  if (transfer.value !== expected.units)
    return { ok: false, reason: "The payment was not for the amount this app asked for" };
  if (!sameAddress(transfer.from, expected.from))
    return { ok: false, reason: "The payment came from a different wallet" };
  return { ok: true };
}

export function createPaymentReader(client: PublicClient): PaymentReader {
  return {
    async waitForReceipt(hash, timeoutMs) {
      let receipt: TransactionReceipt;
      try {
        receipt = await client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
      } catch {
        // A receipt that has not landed is not a failure: the visitor may answer again.
        return null;
      }
      const logs = parseEventLogs({
        abi: transferEventAbi,
        eventName: "Transfer",
        logs: receipt.logs,
      });
      return {
        status: receipt.status,
        transfers: logs.map((log) => ({
          token: log.address,
          from: log.args.from,
          to: log.args.to,
          value: log.args.value,
        })),
      };
    },
  };
}
