import { describe, expect, test } from "bun:test";
import {
  balancePayload,
  createBalanceReader,
  parseWatchedAddress,
  parseWatchedToken,
} from "./balances";
import { WatchConfigError } from "./threshold";

const vitalik = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const usdcOnBase = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Records the requests and answers them with the given body and status. */
function stubFetch(body: unknown, status = 200) {
  const requests: { url: string; authorization: string | null }[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), authorization: headers.get("Authorization") });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

const page = {
  data: [
    { contract: "native", amount: "420000000000000000", decimals: 18, symbol: "ETH" },
    { contract: usdcOnBase, amount: "12250000", decimals: 6, symbol: "USDC" },
  ],
};

describe("createBalanceReader", () => {
  test("uses the native endpoint whose rows have no ERC-20 contract", async () => {
    const { fetchImpl, requests } = stubFetch({
      data: [{ amount: "420000000000000000", decimals: 18, symbol: "ETH" }],
    });
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    const balance = await reader.read({ network: "base", address: vitalik, token: "native" });
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/evm/balances/native");
    expect(balance.raw).toBe(BigInt("420000000000000000"));
  });

  test("filters the ERC-20 request so tokens beyond the first page are not reported as zero", async () => {
    const { fetchImpl, requests } = stubFetch(page);
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    await reader.read({ network: "base", address: vitalik, token: usdcOnBase });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/evm/balances");
    expect(url.searchParams.get("contract")).toBe(usdcOnBase.toLowerCase());
  });

  test("a stalled provider is aborted so future polls can retry", async () => {
    const fetchImpl = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      })) as typeof fetch;
    const reader = createBalanceReader({ apiKey: "k", fetchImpl, timeoutMs: 5 });
    await expect(
      reader.read({ network: "base", address: vitalik, token: "native" }),
    ).rejects.toThrow();
  });

  test("asks the Token API for the wallet and carries the key", async () => {
    const { fetchImpl, requests } = stubFetch(page);
    const reader = createBalanceReader({ apiKey: "jwt-token", fetchImpl });
    await reader.read({ network: "base", address: vitalik, token: "" });
    const [request] = requests;
    expect(request?.authorization).toBe("Bearer jwt-token");
    const url = new URL(request?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://api.pinax.network/v1/evm/balances/native");
    expect(url.searchParams.get("network")).toBe("base");
    expect(url.searchParams.get("address")).toBe(vitalik);
  });

  test("reads the native balance when no token is configured", async () => {
    const { fetchImpl } = stubFetch(page);
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    expect(await reader.read({ network: "base", address: vitalik, token: "" })).toEqual({
      raw: BigInt("420000000000000000"),
      decimals: 18,
      symbol: "ETH",
      token: "native",
    });
  });

  test("picks the ERC-20 out of the page, matching the address case-insensitively", async () => {
    const { fetchImpl } = stubFetch(page);
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    expect(
      await reader.read({ network: "base", address: vitalik, token: usdcOnBase.toUpperCase() }),
    ).toEqual({
      raw: BigInt("12250000"),
      decimals: 6,
      symbol: "USDC",
      token: usdcOnBase.toLowerCase(),
    });
  });

  test("reads a token the wallet does not hold as zero", async () => {
    const { fetchImpl } = stubFetch({ data: [] });
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    const reading = await reader.read({ network: "base", address: vitalik, token: usdcOnBase });
    expect(reading.raw).toBe(BigInt(0));
  });

  test.each([{ row: null }, { row: {} }, { row: [] }, { row: "invalid" }])(
    "rejects an unreadable result row instead of reporting a zero balance: %p",
    async ({ row }) => {
      const { fetchImpl } = stubFetch({ data: [row] });
      const reader = createBalanceReader({ apiKey: "k", fetchImpl });
      await expect(
        reader.read({ network: "base", address: vitalik, token: usdcOnBase }),
      ).rejects.toThrow("The Token API answered");
    },
  );

  test("rejects a response containing only another token instead of triggering on zero", async () => {
    const { fetchImpl } = stubFetch({
      data: [{ contract: vitalik, amount: "1000000", decimals: 6, symbol: "OTHER" }],
    });
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    await expect(
      reader.read({ network: "base", address: vitalik, token: usdcOnBase }),
    ).rejects.toThrow("without the requested token");
  });

  test("rejects a malformed symbol before it reaches a flow payload", async () => {
    const { fetchImpl } = stubFetch({
      data: [{ contract: usdcOnBase, amount: "1000000", decimals: 6, symbol: { name: "USDC" } }],
    });
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    await expect(
      reader.read({ network: "base", address: vitalik, token: usdcOnBase }),
    ).rejects.toThrow("invalid token symbol");
  });

  test("treats a rejected key as a config problem, not a retry", async () => {
    const { fetchImpl } = stubFetch({ error: "unauthorized" }, 401);
    const reader = createBalanceReader({ apiKey: "stale", fetchImpl });
    await expect(reader.read({ network: "base", address: vitalik, token: "" })).rejects.toThrow(
      WatchConfigError,
    );
  });

  test("retries a server failure", async () => {
    const { fetchImpl } = stubFetch({ error: "boom" }, 503);
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    await expect(reader.read({ network: "base", address: vitalik, token: "" })).rejects.toThrow(
      "The Token API answered 503",
    );
  });

  test("reports a body it cannot read", async () => {
    const { fetchImpl } = stubFetch({ result: [] });
    const reader = createBalanceReader({ apiKey: "k", fetchImpl });
    await expect(reader.read({ network: "base", address: vitalik, token: "" })).rejects.toThrow(
      "without a data array",
    );
  });

  test("honours a base URL override", async () => {
    const { fetchImpl, requests } = stubFetch(page);
    const reader = createBalanceReader({
      apiKey: "k",
      baseUrl: "https://gateway.example",
      fetchImpl,
    });
    await reader.read({ network: "mainnet", address: vitalik, token: "" });
    expect(requests[0]?.url.startsWith("https://gateway.example/v1/evm/balances")).toBe(true);
  });
});

describe("watched address and token", () => {
  test("accepts an address and rejects anything else", () => {
    expect(parseWatchedAddress(` ${vitalik} `)).toBe(vitalik);
    expect(() => parseWatchedAddress("")).toThrow("The watched address is not valid: (blank)");
    expect(() => parseWatchedAddress("vitalik.eth")).toThrow(WatchConfigError);
  });

  test("blank and the literal native both mean the chain's own coin", () => {
    expect(parseWatchedToken("")).toBe("native");
    expect(parseWatchedToken(" NATIVE ")).toBe("native");
    expect(parseWatchedToken(usdcOnBase)).toBe(usdcOnBase.toLowerCase());
    expect(() => parseWatchedToken("0x1234")).toThrow(WatchConfigError);
  });
});

describe("balancePayload", () => {
  test("reports the balance and the threshold it crossed", () => {
    expect(
      balancePayload({ network: "base", comparison: "below", threshold: " 1 " }, vitalik, {
        raw: BigInt("420000000000000000"),
        decimals: 18,
        symbol: "ETH",
        token: "native",
      }),
    ).toEqual({
      address: vitalik,
      network: "base",
      token: "native",
      symbol: "ETH",
      balance: "0.42",
      threshold: "1",
      comparison: "below",
      decimals: 18,
    });
  });
});
