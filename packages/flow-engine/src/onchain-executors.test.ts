import {
  parseNodeConfig,
  type FlowNode,
  type FlowNodeType,
  type Static,
  type TObject,
} from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { BaseError, ContractFunctionRevertedError, parseAbi, type Address, type Hex } from "viem";
import type { ChainProvider, ChainReader, ChainSigner } from "./chain";
import type { ExecutionContext } from "./executor";
import { onchainExecutors } from "./onchain-executors";
import { resolveTemplates } from "./template";

const user = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const hash = "0xabc0000000000000000000000000000000000000000000000000000000000abc" as Hex;

function stubChain(overrides: Partial<ChainProvider> = {}) {
  const calls: string[] = [];
  const reader: ChainReader = {
    async readContract(call) {
      calls.push(`read ${call.functionName}(${(call.args ?? []).map(String).join(",")})`);
      if (call.functionName === "decimals") return 6;
      if (call.functionName === "balanceOf") return 12_500_000n;
      if (call.functionName === "owner") return other;
      return 7n;
    },
    async simulateContract(call) {
      calls.push(
        `simulate ${call.functionName}(${(call.args ?? []).map(String).join(",")}) from ${call.account}${call.value ? ` value ${call.value}` : ""}`,
      );
      return true;
    },
    async estimateContractGas() {
      return 21_000n;
    },
    async estimateGas(request) {
      calls.push(`estimateGas to ${request.to} value ${request.value ?? 0n}`);
      return 21_000n;
    },
    async getBalance() {
      return 10n ** 18n;
    },
    async waitForTransactionReceipt(tx) {
      calls.push(`receipt ${tx}`);
      return { transactionHash: tx, status: "success", blockNumber: 42n, gasUsed: 20_000n };
    },
  };
  const signer: ChainSigner = {
    address: user,
    async writeContract(call) {
      calls.push(`write ${call.functionName}(${(call.args ?? []).map(String).join(",")})`);
      return hash;
    },
    async sendTransaction(request) {
      calls.push(`send to ${request.to} value ${request.value ?? 0n}`);
      return hash;
    },
    async signMessage(message) {
      return `0xsigned:${message}` as Hex;
    },
    async signTransaction(request) {
      return `0xraw:${request.to}` as Hex;
    },
  };
  const chain: ChainProvider = {
    chainId: 84532,
    chainName: "Base Sepolia",
    mode: "dry-run",
    reader,
    account: user,
    signer,
    usdcAddress: usdc,
    ...overrides,
  };
  return { chain, calls };
}

function context(
  type: FlowNodeType,
  config: Record<string, unknown>,
  chain?: ChainProvider,
  inputs: Record<string, unknown> = {},
): ExecutionContext {
  const node: FlowNode = { id: "n", type, position: { x: 0, y: 0 }, label: type, config };
  const scope = { input: inputs, vars: {}, trigger: undefined };
  return {
    node,
    inputs,
    trigger: undefined,
    variables: {},
    config: <T extends TObject>(schema: T) =>
      resolveTemplates(parseNodeConfig(schema, config), scope) as Static<T>,
    fetch,
    ...(chain ? { chain } : {}),
    now: () => new Date(),
    sleep: async () => {},
  };
}

async function run(
  type: FlowNodeType,
  config: Record<string, unknown>,
  chain?: ChainProvider,
  inputs?: Record<string, unknown>,
) {
  const executor = onchainExecutors[type]!;
  if (executor.kind === "screen") throw new Error("not a step");
  return executor.run(context(type, config, chain, inputs));
}

const counterAbi =
  "function count() view returns (uint256)\nfunction increment(uint256 by) returns (uint256)\nfunction owner() view returns (address)";

describe("onchain executors", () => {
  test("read-contract decodes and returns JSON-safe values", async () => {
    const { chain, calls } = stubChain();
    expect(
      await run(
        "onchain.read-contract",
        { address: other, abi: counterAbi, functionName: "count" },
        chain,
      ),
    ).toEqual({ result: "7" });
    expect(
      await run(
        "onchain.read-contract",
        { address: other, abi: counterAbi, functionName: "owner" },
        chain,
      ),
    ).toEqual({ result: other });
    expect(calls).toEqual(["read count()", "read owner()"]);
  });

  test("read-contract accepts a JSON ABI and coerces integer args from templates", async () => {
    const { chain, calls } = stubChain();
    const abi = JSON.stringify(parseAbi(["function increment(uint256 by) returns (uint256)"]));
    await run(
      "onchain.read-contract",
      { address: other, abi, functionName: "increment", args: '["{{input.args.by}}"]' },
      chain,
      { args: { by: 5 } },
    );
    expect(calls).toEqual(["read increment(5)"]);
  });

  test("write-contract simulates in dry-run mode and sends in live mode", async () => {
    const dry = stubChain();
    expect(
      await run(
        "onchain.write-contract",
        { address: other, abi: counterAbi, functionName: "increment", args: "[3]", value: "0.5" },
        dry.chain,
      ),
    ).toEqual({
      receipt: { simulated: true, result: true, gas: "21000" },
    });
    expect(dry.calls).toEqual([`simulate increment(3) from ${user} value 500000000000000000`]);

    const live = stubChain({ mode: "live" });
    expect(
      await run(
        "onchain.write-contract",
        { address: other, abi: counterAbi, functionName: "increment", args: "[3]" },
        live.chain,
      ),
    ).toEqual({
      receipt: {
        simulated: false,
        hash,
        transactionHash: hash,
        status: "success",
        blockNumber: "42",
        gasUsed: "20000",
        result: true,
      },
    });
    expect(live.calls).toEqual([
      `simulate increment(3) from ${user}`,
      "write increment(3)",
      `receipt ${hash}`,
    ]);
  });

  test("reverts become readable node errors", async () => {
    const { chain } = stubChain();
    chain.reader.simulateContract = async () => {
      const revert = new ContractFunctionRevertedError({
        abi: parseAbi(["error NotOwner(address caller)"]),
        functionName: "increment",
        data: "0x" as Hex,
      });
      Object.assign(revert, { data: { errorName: "NotOwner", args: [other] } });
      throw new BaseError("Execution reverted", { cause: revert });
    };
    await expect(
      run(
        "onchain.write-contract",
        { address: other, abi: counterAbi, functionName: "increment", args: "[1]" },
        chain,
      ),
    ).rejects.toThrow(`Reverted: NotOwner(${other})`);
  });

  test("live writes need a signer and explain when it is missing", async () => {
    const { chain } = stubChain({
      mode: "live",
      signer: undefined,
      signerUnavailableReason: "Server signing is not enabled for this wallet",
    });
    await expect(
      run(
        "onchain.write-contract",
        { address: other, abi: counterAbi, functionName: "increment", args: "[1]" },
        chain,
      ),
    ).rejects.toThrow("Server signing is not enabled for this wallet");
    await expect(
      run(
        "onchain.read-contract",
        { address: other, abi: counterAbi, functionName: "count" },
        undefined,
      ),
    ).rejects.toThrow("No chain is configured for this run");
  });

  test("transfer-token sends native value or an ERC-20 transfer", async () => {
    const native = stubChain({ mode: "live" });
    expect(
      await run("onchain.transfer-token", { to: other, amount: "0.25", token: "" }, native.chain),
    ).toMatchObject({ receipt: { simulated: false, hash, status: "success" } });
    expect(native.calls).toEqual([`send to ${other} value 250000000000000000`, `receipt ${hash}`]);

    const token = stubChain();
    expect(
      await run("onchain.transfer-token", { to: other, amount: "1.5", token: usdc }, token.chain),
    ).toEqual({
      receipt: {
        token: usdc,
        to: other,
        amount: "1.5",
        simulated: true,
        result: true,
        gas: "21000",
      },
    });
    expect(token.calls).toEqual([
      "read decimals()",
      `simulate transfer(${other},1500000) from ${user}`,
    ]);
  });

  test("usdc payment, payout and balance use the configured USDC contract", async () => {
    const { chain, calls } = stubChain({ mode: "live" });
    const payment = await run("usdc.payment", { to: other, amount: "2" }, chain, {});
    expect(payment).toMatchObject({ receipt: { token: usdc, amount: "2", hash } });
    expect(await run("usdc.balance", {}, chain)).toEqual({
      balance: { address: user, raw: "12500000", formatted: "12.5" },
    });
    expect(calls.slice(0, 3)).toEqual([
      "read decimals()",
      `simulate transfer(${other},2000000) from ${user}`,
      `write transfer(${other},2000000)`,
    ]);
    const noUsdc = stubChain({ usdcAddress: undefined });
    await expect(run("usdc.payout", { to: other, amount: "1" }, noUsdc.chain)).rejects.toThrow(
      "No USDC contract is configured for Base Sepolia",
    );
  });

  test("sign-message, wallet, and sign-transaction", async () => {
    const { chain } = stubChain();
    expect(
      await run("onchain.sign-message", { message: "hello {{input.message}}" }, chain, {
        message: "world",
      }),
    ).toEqual({ signature: "0xsigned:hello world" });
    expect(await run("privy.wallet", {}, chain)).toEqual({
      wallet: { address: user, chainId: 84532 },
    });
    expect(await run("privy.sign-transaction", { to: other, value: "0", data: "" }, chain)).toEqual(
      { signed: `0xraw:${other}` },
    );
    await expect(
      run("privy.sign-transaction", { to: other, data: "nothex" }, chain),
    ).rejects.toThrow("Calldata must be hex");
    await expect(run("usdc.payment", { to: "nope", amount: "1" }, chain)).rejects.toThrow(
      "Recipient is not a valid address",
    );
    await expect(run("usdc.payment", { to: other, amount: "1,5" }, chain)).rejects.toThrow(
      "Amount must be a decimal amount",
    );
  });
});
