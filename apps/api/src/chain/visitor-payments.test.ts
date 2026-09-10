import { describe, expect, test } from "bun:test";
import type { Address, Hex } from "viem";
import { checkVisitorPayment, createPaymentReader, type PaymentReceipt } from "./visitor-payments";

const usdc: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const other: Address = "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88";
const payer: Address = "0x1111111111111111111111111111111111111111";
const collector: Address = "0x2222222222222222222222222222222222222222";
const stranger: Address = "0x3333333333333333333333333333333333333333";

const expected = { token: usdc, from: payer, to: collector, units: BigInt(12_500_000) };

const transfer = (over: Partial<PaymentReceipt["transfers"][number]> = {}) => ({
  token: usdc,
  from: payer,
  to: collector,
  value: BigInt(12_500_000),
  ...over,
});

const receipt = (over: Partial<PaymentReceipt> = {}): PaymentReceipt => ({
  status: "success",
  transfers: [transfer()],
  ...over,
});

describe("checkVisitorPayment", () => {
  test("accepts the exact transfer the screen asked for", () => {
    expect(checkVisitorPayment(receipt(), expected)).toEqual({ ok: true });
  });

  test("compares addresses without caring how they are cased", () => {
    const cased = receipt({
      transfers: [
        transfer({ token: usdc.toUpperCase() as Address, to: collector.toLowerCase() as Address }),
      ],
    });
    expect(
      checkVisitorPayment(cased, { ...expected, from: payer.toUpperCase() as Address }),
    ).toEqual({
      ok: true,
    });
  });

  test("refuses a reverted transaction", () => {
    expect(checkVisitorPayment(receipt({ status: "reverted" }), expected)).toEqual({
      ok: false,
      reason: "The payment transaction did not succeed",
    });
  });

  test("refuses a transaction that moved no USDC", () => {
    expect(
      checkVisitorPayment(receipt({ transfers: [transfer({ token: other })] }), expected),
    ).toEqual({ ok: false, reason: "The transaction did not transfer this app's payment token" });
  });

  test("refuses a transaction carrying more than one USDC transfer", () => {
    expect(checkVisitorPayment(receipt({ transfers: [transfer(), transfer()] }), expected)).toEqual(
      { ok: false, reason: "The transaction made more than one payment" },
    );
  });

  test("refuses a payment to somebody else", () => {
    expect(
      checkVisitorPayment(receipt({ transfers: [transfer({ to: stranger })] }), expected),
    ).toEqual({ ok: false, reason: "The payment went to a different address" });
  });

  test("refuses the wrong amount, short or over", () => {
    for (const value of [BigInt(12_499_999), BigInt(12_500_001)])
      expect(checkVisitorPayment(receipt({ transfers: [transfer({ value })] }), expected)).toEqual({
        ok: false,
        reason: "The payment was not for the amount this app asked for",
      });
  });

  /*
   * The flow owner paying their own app: with a blank recipient the payment collects into the
   * owner's wallet, and when the owner is also the visitor that is a transfer to themselves. It
   * is a real ERC-20 transfer that emits one Transfer log with from == to, and it must be taken.
   */
  test("accepts a visitor paying their own wallet, which is what the owner demoing does", () => {
    const self = receipt({
      transfers: [transfer({ from: collector, to: collector })],
    });
    expect(checkVisitorPayment(self, { ...expected, from: collector })).toEqual({ ok: true });
  });

  test("still refuses a self-transfer that paid a different address", () => {
    const elsewhere = receipt({ transfers: [transfer({ from: stranger, to: stranger })] });
    expect(checkVisitorPayment(elsewhere, { ...expected, from: stranger })).toEqual({
      ok: false,
      reason: "The payment went to a different address",
    });
  });

  test("refuses somebody else's transfer, so a visitor cannot submit a payment they did not make", () => {
    expect(
      checkVisitorPayment(receipt({ transfers: [transfer({ from: stranger })] }), expected),
    ).toEqual({ ok: false, reason: "The payment came from a different wallet" });
  });
});

describe("createPaymentReader", () => {
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const pad = (address: Address) => `0x${"0".repeat(24)}${address.slice(2)}` as Hex;

  test("decodes the USDC transfers a receipt carries and ignores unrelated logs", async () => {
    const reader = createPaymentReader({
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [
          { address: other, topics: ["0xdeadbeef"], data: "0x" },
          {
            address: usdc,
            topics: [transferTopic, pad(payer), pad(collector)],
            data: `0x${(12_500_000).toString(16).padStart(64, "0")}`,
          },
        ],
      }),
    } as never);
    expect(await reader.waitForReceipt(`0x${"a".repeat(64)}`, 1000)).toEqual({
      status: "success",
      transfers: [{ token: usdc, from: payer, to: collector, value: BigInt(12_500_000) }],
    });
  });

  test("answers null when the receipt has not landed in time", async () => {
    const reader = createPaymentReader({
      waitForTransactionReceipt: async () => {
        throw new Error("Timed out while waiting for transaction");
      },
    } as never);
    expect(await reader.waitForReceipt(`0x${"a".repeat(64)}`, 1)).toBeNull();
  });
});
