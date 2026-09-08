import { describe, expect, test } from "bun:test";
import type { PaymentPolicyOperation } from "@automator/db";
import type { ChainSigner } from "@automator/flow-engine";
import { encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";
import { createPaymentPolicySigner } from "./payment-policy";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const recipient = "0x2222222222222222222222222222222222222222" as Address;
const usdc = "0x3333333333333333333333333333333333333333" as Address;
const hash = `0x${"a".repeat(64)}` as Hex;
const transfer = (amount = 7n) =>
  encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] });

function fixture() {
  let enabled = true;
  let failure = false;
  const operations: PaymentPolicyOperation[] = [];
  const calls: { method: string; input: unknown }[] = [];
  function record(method: string, input: unknown) {
    calls.push({ method, input });
    if (failure) throw new Error("Unknown broadcast outcome");
    return Promise.resolve(hash);
  }
  const raw: ChainSigner = {
    address: wallet,
    writeContract: (input) => record("write", input),
    sendTransaction: (input) => record("send", input),
    signMessage: (input) => record("message", input),
    signTransaction: (input) => record("sign", input),
  };
  const signer = createPaymentPolicySigner(raw, "owner", 84532, usdc, {
    async reserve(ownerId, operation) {
      expect(ownerId).toBe("owner");
      operations.push(operation);
      if (!enabled) return null;
      if (operation.kind === "unsupported") throw new Error(`Payment policy: ${operation.reason}`);
      if (BigInt(operation.amount) > 10n) throw new Error("Payment policy: per-transfer limit");
      return "reservation";
    },
  });
  return {
    signer,
    operations,
    calls,
    enable: (value: boolean) => {
      enabled = value;
    },
    fail: () => {
      failure = true;
    },
  };
}

describe("API payment policy signer", () => {
  test("reserves native and USDC calldata with exact base units", async () => {
    const f = fixture();
    await f.signer.sendTransaction({ to: recipient, value: 4n });
    await f.signer.sendTransaction({ to: usdc, data: transfer() });
    await f.signer.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, 8n],
    });
    expect(f.operations).toEqual([
      { kind: "transfer", chainId: 84532, asset: "native", recipient, amount: "4" },
      { kind: "transfer", chainId: 84532, asset: "usdc", recipient, amount: "7" },
      { kind: "transfer", chainId: 84532, asset: "usdc", recipient, amount: "8" },
    ]);
    expect(f.calls).toHaveLength(3);
  });

  test("a policy denial reaches the caller before any underlying signing", async () => {
    const f = fixture();
    await expect(f.signer.sendTransaction({ to: recipient, value: 11n })).rejects.toThrow(
      "per-transfer limit",
    );
    expect(f.calls).toHaveLength(0);
  });

  test.each([
    ["trailing bytes", `${transfer()}00`],
    [
      "nonzero address padding",
      transfer().replace("0000000000000000000000002222", "ffffffffffffffffffffffff2222"),
    ],
    ["truncated", transfer().slice(0, -2)],
    ["unknown selector", "0xdeadbeef"],
    [
      "approval",
      encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [recipient, 5n] }),
    ],
    [
      "transferFrom",
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [wallet, recipient, 5n],
      }),
    ],
  ])("rejects %s instead of treating it as a direct transfer", async (_, data) => {
    const f = fixture();
    await expect(f.signer.sendTransaction({ to: usdc, data: data as Hex })).rejects.toThrow(
      "Payment policy",
    );
    expect(f.calls).toHaveLength(0);
  });

  test("rejects other tokens and USDC calls carrying native value", async () => {
    const f = fixture();
    await expect(f.signer.sendTransaction({ to: wallet, data: transfer() })).rejects.toThrow(
      "Payment policy",
    );
    await expect(
      f.signer.sendTransaction({ to: usdc, data: transfer(), value: 1n }),
    ).rejects.toThrow("Payment policy");
    expect(f.calls).toHaveLength(0);
  });

  test("arbitrary contract calls, message signatures and offline transactions cannot bypass limits", async () => {
    const f = fixture();
    await expect(
      f.signer.writeContract({
        address: usdc,
        abi: parseAbi(["function multicall(bytes[] calls)"]),
        functionName: "multicall",
        args: [[transfer()]],
      }),
    ).rejects.toThrow("Payment policy");
    await expect(f.signer.signMessage("authorize spender")).rejects.toThrow("Message signing");
    await expect(f.signer.signTransaction({ to: recipient, value: 1n })).rejects.toThrow(
      "Offline transaction",
    );
    expect(f.calls).toHaveLength(0);
  });

  test("disabled policy preserves every operation and enabling applies to the same signer", async () => {
    const f = fixture();
    f.enable(false);
    await f.signer.sendTransaction({ to: recipient, value: 100n });
    await f.signer.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [recipient, 100n],
    });
    await f.signer.signMessage("hello");
    await f.signer.signTransaction({ to: recipient, value: 100n });
    f.enable(true);
    await expect(f.signer.signMessage("hello")).rejects.toThrow("Message signing");
    expect(f.calls.map((call) => call.method)).toEqual(["send", "write", "message", "sign"]);
    expect(f.operations).toHaveLength(5);
  });

  test("ambiguous signing failures retain the admitted reservation", async () => {
    const f = fixture();
    f.fail();
    await expect(f.signer.sendTransaction({ to: recipient, value: 4n })).rejects.toThrow(
      "Unknown broadcast outcome",
    );
    expect(f.operations).toHaveLength(1);
    expect(f.calls).toHaveLength(1);
  });

  test("hidden viem transaction overrides are not forwarded", async () => {
    const f = fixture();
    await f.signer.sendTransaction({
      to: recipient,
      value: 4n,
      chain: { id: 1 },
      authorizationList: [{}],
    } as never);
    expect(f.calls[0]?.input).toEqual({ to: recipient, value: 4n, data: undefined });
    await f.signer.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, 2n],
      dataSuffix: "0xffff",
      account: recipient,
    } as never);
    expect(f.calls[1]?.input).not.toHaveProperty("dataSuffix");
    expect(f.calls[1]?.input).not.toHaveProperty("account");
  });

  test("contract arguments cannot change while durable admission is pending", async () => {
    const f = fixture();
    const args = [recipient, 2n];
    const pending = f.signer.writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args,
    });
    args[1] = 1000n;
    await pending;
    expect(f.operations[0]).toMatchObject({ amount: "2" });
    expect(f.calls[0]?.input).toMatchObject({ args: [recipient, 2n] });
  });
});
