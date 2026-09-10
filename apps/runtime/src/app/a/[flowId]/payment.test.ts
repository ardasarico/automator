import type { MiniAppPayment } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { custom, decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import {
  describePaymentError,
  payingWallet,
  paymentChain,
  readUsdcBalance,
  transferRequest,
} from "./payment";

const payment: MiniAppPayment = {
  chainId: 84532,
  chainName: "Base Sepolia",
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  decimals: 6,
  to: "0x9999999999999999999999999999999999999999",
  amount: "12.50",
  amountUnits: "12500000",
};

const payer = "0x1111111111111111111111111111111111111111";

describe("transferRequest", () => {
  test("calls transfer on the payment token, for the units the API asked for", () => {
    const request = transferRequest(payment, payer);
    expect(request).toMatchObject({ from: payer, to: payment.token });
    const call = decodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
      data: request.data,
    });
    expect(call.functionName).toBe("transfer");
    expect<string>(call.args[0]).toBe(payment.to);
    expect(call.args[1]).toBe(BigInt(12_500_000));
  });

  test("sends no native value, because a token transfer moves no ether", () => {
    expect("value" in transferRequest(payment, payer)).toBe(false);
  });

  test("builds a transfer to the payer's own wallet, which the owner demoing their app makes", () => {
    const request = transferRequest({ ...payment, to: payer }, payer);
    const call = decodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
      data: request.data,
    });
    expect<string>(call.args[0]).toBe(payer);
    expect(request.from).toBe(payer);
  });

  test("refuses a payment whose addresses are not addresses", () => {
    expect(() => transferRequest({ ...payment, to: "nope" }, payer)).toThrow();
    expect(() => transferRequest(payment, "nope")).toThrow();
  });
});

describe("paymentChain", () => {
  test("is the registry chain the payment names, with its public RPC", () => {
    const chain = paymentChain(payment);
    expect(chain.id).toBe(84532);
    expect(chain.name).toBe("Base Sepolia");
    expect(chain.rpcUrls.default.http[0]).toBe("https://sepolia.base.org");
    expect(paymentChain({ ...payment, chainId: 4801 }).name).toBe("World Chain Sepolia");
  });

  test("refuses a chain this app does not know", () => {
    expect(() => paymentChain({ ...payment, chainId: 1 })).toThrow("cannot take payments");
  });
});

describe("describePaymentError", () => {
  test("says what the visitor can do about the ways a payment fails", () => {
    expect(describePaymentError({ code: 4001 })).toContain("cancelled");
    expect(describePaymentError(new Error("insufficient funds for gas * price + value"))).toContain(
      "gas",
    );
    expect(describePaymentError(new Error("transfer amount exceeds balance"))).toContain("USDC");
    expect(describePaymentError(new Error("boom"))).toBe(
      "The payment did not go through. Try again.",
    );
  });

  test("never repeats raw chain wording back to a visitor", () => {
    expect(describePaymentError(new Error("execution reverted: 0xdeadbeef"))).not.toContain("0x");
  });
});

describe("payingWallet", () => {
  const embedded = { address: "0xaaa", walletClientType: "privy" };
  const external = { address: "0xbbb", walletClientType: "metamask" };

  test("prefers the Privy embedded wallet, which is the one the API attributes the payment to", () => {
    expect(payingWallet([external, embedded])).toBe(embedded);
  });

  test("falls back to the wallet the visitor connected, matching the same preference server-side", () => {
    expect(payingWallet([external])).toBe(external);
    expect(payingWallet([])).toBeNull();
  });
});

describe("readUsdcBalance", () => {
  const answering = (result: bigint) =>
    custom({
      async request({ method }: { method: string }) {
        if (method === "eth_chainId") return "0x14a34";
        if (method === "eth_call")
          return encodeFunctionResult({
            abi: parseAbi(["function balanceOf(address owner) view returns (uint256)"]),
            functionName: "balanceOf",
            result,
          });
        throw new Error(`Unexpected ${method}`);
      },
    });

  test("reads the payment token at the payment's own decimals", async () => {
    expect(await readUsdcBalance(payment, payer, answering(BigInt(25_000_000)))).toBe("25");
    expect(await readUsdcBalance(payment, payer, answering(BigInt(1_234_567)))).toBe("1.234567");
  });
});
