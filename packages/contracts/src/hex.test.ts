import { describe, expect, test } from "bun:test";
import { addressPattern, isHexAddress, isTxHash, txHashPattern } from "./hex";

describe("hex shapes", () => {
  const address = "0x" + "ab".repeat(20);
  const hash = "0x" + "AB".repeat(32);

  test("an address is 0x and forty hex digits", () => {
    expect(isHexAddress(address)).toBe(true);
    expect(isHexAddress(address.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(isHexAddress(address + "a")).toBe(false);
    expect(isHexAddress(address.replace("ab", "zz"))).toBe(false);
    expect(isHexAddress(` ${address}`)).toBe(false);
    expect(isHexAddress(42)).toBe(false);
    expect(new RegExp(addressPattern).test(address)).toBe(true);
  });

  test("a transaction hash is 0x and sixty-four hex digits", () => {
    expect(isTxHash(hash)).toBe(true);
    expect(isTxHash(hash.slice(0, -1))).toBe(false);
    expect(isTxHash(address)).toBe(false);
    expect(isTxHash(null)).toBe(false);
    expect(new RegExp(txHashPattern).test(hash)).toBe(true);
  });
});
