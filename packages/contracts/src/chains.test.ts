import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import {
  chainIdSchema,
  chainName,
  chains,
  defaultChainId,
  explorerTransactionUrl,
  getChain,
  isChainId,
} from "./chains";

describe("chain registry", () => {
  test("lists Base Sepolia first as the default and World Chain Sepolia", () => {
    expect(chains.map((chain) => chain.id)).toEqual([84532, 4801]);
    expect(defaultChainId).toBe(84532);
    expect(getChain(84532)).toMatchObject({
      name: "Base Sepolia",
      rpcUrl: "https://sepolia.base.org",
      explorerUrl: "https://sepolia.basescan.org",
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    });
    expect(getChain(4801)).toMatchObject({
      name: "World Chain Sepolia",
      rpcUrl: "https://worldchain-sepolia.g.alchemy.com/public",
      explorerUrl: "https://worldchain-sepolia.explorer.alchemy.com",
      usdcAddress: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
    });
    expect(getChain(1)).toBeUndefined();
    expect(chainName(4801)).toBe("World Chain Sepolia");
    expect(chainName(1)).toBe("Chain 1");
  });

  test("the schema and the guard accept only registry ids", () => {
    expect(Value.Check(chainIdSchema, 84532)).toBe(true);
    expect(Value.Check(chainIdSchema, 4801)).toBe(true);
    expect(Value.Check(chainIdSchema, 8453)).toBe(false);
    expect(Value.Check(chainIdSchema, "84532")).toBe(false);
    expect(isChainId(4801)).toBe(true);
    expect(isChainId(31337)).toBe(false);
    expect(isChainId("4801")).toBe(false);
  });

  test("builds explorer links per chain", () => {
    expect(explorerTransactionUrl(84532, "0xabc")).toBe("https://sepolia.basescan.org/tx/0xabc");
    expect(explorerTransactionUrl(4801, "0xabc")).toBe(
      "https://worldchain-sepolia.explorer.alchemy.com/tx/0xabc",
    );
    expect(explorerTransactionUrl(1, "0xabc")).toBeUndefined();
  });
});
