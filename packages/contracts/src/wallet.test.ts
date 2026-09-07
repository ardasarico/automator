import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import {
  getWalletContract,
  getWalletTransactionsContract,
  walletSchema,
  walletTransactionSchema,
} from "./wallet";

describe("wallet transactions contract", () => {
  test("describes GET /wallet/transactions as run-derived transactions", () => {
    expect(getWalletTransactionsContract).toMatchObject({
      method: "GET",
      path: "/wallet/transactions",
    });
    const transaction = {
      hash: `0x${"ab".repeat(32)}`,
      chainId: 84532,
      flowId: "f1",
      flowName: "Payout",
      runId: "r1",
      nodeId: "send",
      nodeType: "usdc.transfer",
      at: "2026-09-07T10:00:01.000Z",
    };
    const list = getWalletTransactionsContract.response[200];
    expect(Value.Check(walletTransactionSchema, transaction)).toBe(true);
    expect(Value.Check(walletTransactionSchema, { ...transaction, hash: "0xabc" })).toBe(false);
    expect(Value.Check(list, { transactions: [transaction] })).toBe(true);
    expect(Value.Check(list, { transactions: [] })).toBe(true);
  });
});

describe("wallet contract", () => {
  test("describes GET /wallet with an optional chain id", () => {
    expect(getWalletContract).toMatchObject({ method: "GET", path: "/wallet" });
    expect(Value.Check(getWalletContract.query, {})).toBe(true);
    expect(Value.Check(getWalletContract.query, { chainId: "4801" })).toBe(true);
  });

  test("balances are decimal strings and signing is optional", () => {
    const wallet = {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 84532,
      chainName: "Base Sepolia",
      nativeBalance: "0.05",
      nativeSymbol: "ETH",
      usdcBalance: "12.5",
    };
    expect(Value.Check(walletSchema, wallet)).toBe(true);
    expect(Value.Check(walletSchema, { ...wallet, signing: false })).toBe(true);
    expect(Value.Check(walletSchema, { ...wallet, nativeBalance: 0.05 })).toBe(false);
  });
});
