import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { getWalletContract, walletSchema } from "./wallet";

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
