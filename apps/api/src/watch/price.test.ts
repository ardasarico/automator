import { describe, expect, test } from "bun:test";
import { findPriceFeed } from "@automator/contracts";
import type { ChainReader } from "@automator/flow-engine";
import type { Address } from "viem";
import { pricePayload, readPrice, resolveFeed } from "./price";
import { WatchConfigError } from "./threshold";

const ethUsd = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" as Address;
const baseSepolia = 84532;

function stubReader(round: readonly bigint[], decimals = 8) {
  const calls: string[] = [];
  const reader = {
    readContract: async (call: { functionName: string }) => {
      calls.push(call.functionName);
      return call.functionName === "decimals" ? decimals : round;
    },
  } as unknown as ChainReader;
  return { reader, calls };
}

describe("resolveFeed", () => {
  test("takes the published address and decimals for a known pair", () => {
    expect(resolveFeed({ pair: "ETH / USD", feed: "" }, baseSepolia)).toEqual({
      address: ethUsd,
      decimals: 8,
    });
  });

  test("uses the typed address when the pair is custom", () => {
    const feed = "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298";
    expect(resolveFeed({ pair: "custom", feed }, baseSepolia)).toEqual({
      address: feed as Address,
    });
  });

  test("falls back to the typed address on a chain without the pair", () => {
    const feed = "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298";
    expect(resolveFeed({ pair: "ETH / USD", feed }, 4801)).toEqual({ address: feed as Address });
  });

  test("explains that a chain publishes no feed for the pair", () => {
    expect(() => resolveFeed({ pair: "ETH / USD", feed: "" }, 4801)).toThrow(
      'No ETH / USD feed is published on chain 4801; set the pair to "custom" and give a feed address',
    );
  });

  test("rejects a custom pair without a valid address", () => {
    expect(() => resolveFeed({ pair: "custom", feed: "" }, baseSepolia)).toThrow(WatchConfigError);
    expect(() => resolveFeed({ pair: "custom", feed: "0x1234" }, baseSepolia)).toThrow(
      "The feed address is not valid: 0x1234",
    );
  });

  test("every published feed is a resolvable pair", () => {
    expect(findPriceFeed(baseSepolia, "BTC / USD")?.decimals).toBe(8);
    expect(findPriceFeed(baseSepolia, "NOPE / USD")).toBeUndefined();
  });
});

describe("readPrice", () => {
  const round = [
    BigInt("18446744073709562301"),
    BigInt("387542000000"),
    BigInt(1788858000),
    BigInt(1788858900),
    BigInt("18446744073709562301"),
  ] as const;

  test("returns the answer at the registry's decimals without a second call", async () => {
    const { reader, calls } = stubReader(round);
    const reading = await readPrice(reader, ethUsd, 8);
    expect(reading).toEqual({
      raw: BigInt("387542000000"),
      decimals: 8,
      roundId: BigInt("18446744073709562301"),
      updatedAt: BigInt(1788858900),
    });
    expect(calls).toEqual(["latestRoundData"]);
  });

  test("asks the contract for its decimals when the pair is custom", async () => {
    const { reader, calls } = stubReader(round, 18);
    expect((await readPrice(reader, ethUsd)).decimals).toBe(18);
    expect(calls).toEqual(["latestRoundData", "decimals"]);
  });

  test("refuses a feed that has not answered yet", async () => {
    const { reader } = stubReader([round[0], BigInt(0), round[2], round[3], round[4]]);
    await expect(readPrice(reader, ethUsd, 8)).rejects.toThrow("has no answer yet");
  });
});

describe("pricePayload", () => {
  test("reports the reading, the threshold and when the feed updated", () => {
    const payload = pricePayload(
      { pair: "ETH / USD", comparison: "below", threshold: " 4000 " },
      ethUsd,
      {
        raw: BigInt("387542000000"),
        decimals: 8,
        roundId: BigInt(7),
        updatedAt: BigInt(1788858900),
      },
      baseSepolia,
    );
    expect(payload).toEqual({
      pair: "ETH / USD",
      feed: ethUsd,
      price: "3875.42",
      threshold: "4000",
      comparison: "below",
      decimals: 8,
      roundId: "7",
      updatedAt: "2026-09-08T09:15:00.000Z",
      chainId: baseSepolia,
    });
  });
});
