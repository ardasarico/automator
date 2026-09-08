import {
  readContractConfigSchema,
  signMessageConfigSchema,
  signTransactionConfigSchema,
  transferTokenConfigSchema,
  usdcBalanceConfigSchema,
  usdcPaymentConfigSchema,
  usdcTransferConfigSchema,
  writeContractConfigSchema,
} from "@automator/contracts";
import { formatUnits, isAddress, isHex, parseUnits, type Address, type Hex } from "viem";
import { coerceArgs, erc20Abi, findFunction, jsonSafe, parseAbiText, parseArgsText } from "./abi";
import type { ChainProvider, ChainSigner, ContractCall } from "./chain";
import { describeChainError } from "./chain-errors";
import { NodeExecutionError, type ExecutionContext, type ExecutorRegistry } from "./executor";

/** Written without a bigint literal so consumers compiling for older targets still type-check. */
const ZERO = BigInt(0);

function requireChain(context: ExecutionContext): ChainProvider {
  if (!context.chain) throw new NodeExecutionError("No chain is configured for this run");
  return context.chain;
}

function requireAccount(chain: ChainProvider): Address {
  if (!chain.account) throw new NodeExecutionError("This run has no wallet to act as");
  return chain.account;
}

function requireSigner(chain: ChainProvider): ChainSigner {
  if (!chain.signer)
    throw new NodeExecutionError(
      chain.signerUnavailableReason ?? "Server signing is not enabled for this wallet",
    );
  return chain.signer;
}

function address(value: unknown, what: string): Address {
  const text = typeof value === "string" ? value.trim() : "";
  if (!isAddress(text)) throw new NodeExecutionError(`${what} is not a valid address`);
  return text;
}

function amount(value: unknown, decimals: number, what: string): bigint {
  if (typeof value === "number" && Math.abs(value) > Number.MAX_SAFE_INTEGER)
    throw new NodeExecutionError(
      `${what} must be a decimal string when it exceeds the safe integer range`,
    );
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d+)?$/.test(text)) throw new NodeExecutionError(`${what} must be a decimal amount`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new NodeExecutionError("Token decimals must be an integer between 0 and 255");
  // parseUnits rounds excess precision; a transfer must always preserve the requested amount.
  const fraction = text.split(".")[1] ?? "";
  if (/[^0]/.test(fraction.slice(decimals)))
    throw new NodeExecutionError(`${what} has more than ${decimals} decimal places`);
  return parseUnits(text, decimals);
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof NodeExecutionError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new NodeExecutionError(describeChainError(error));
  }
}

function buildCall(config: {
  address: string;
  abi: string;
  functionName: string;
  args: unknown;
}): ContractCall {
  const abi = parseAbiText(config.abi);
  const args = parseArgsText(config.args);
  const fn = findFunction(abi, config.functionName, args.length);
  return {
    address: address(config.address, "Contract address"),
    // Bind the chosen overload while retaining custom errors for readable revert messages.
    abi: abi.filter((item) => item.type !== "function" || item === fn),
    functionName: fn.name,
    args: coerceArgs(fn.inputs, args),
  };
}

/** Simulates or sends a contract write, answering the same shape either way. */
type WriteOptions = Pick<ExecutionContext, "signal" | "checkpoint"> & {
  validateResult?: (result: unknown) => void;
};

async function performWrite(
  chain: ChainProvider,
  call: ContractCall,
  value: bigint,
  options: WriteOptions = {},
) {
  const { signal, validateResult } = options;
  signal?.throwIfAborted();
  const account = requireAccount(chain);
  const request = { ...call, account, ...(value > ZERO ? { value } : {}) };
  if (chain.mode === "dry-run") {
    const [result, gas] = await Promise.all([
      chain.reader.simulateContract(request),
      chain.reader.estimateContractGas(request),
    ]);
    validateResult?.(result);
    return { simulated: true, result: jsonSafe(result), gas: gas.toString() };
  }
  const signer = requireSigner(chain);
  const result = await chain.reader.simulateContract(request);
  validateResult?.(result);
  signal?.throwIfAborted();
  const hash = await signer.writeContract({ ...call, ...(value > ZERO ? { value } : {}) });
  options.checkpoint?.({ receipt: { simulated: false, hash } });
  const receipt = await chain.reader.waitForTransactionReceipt(hash);
  if (receipt.status !== "success") throw new NodeExecutionError(`Transaction ${hash} reverted`);
  return { simulated: false, hash, ...(jsonSafe(receipt) as object), result: jsonSafe(result) };
}

/** Simulates or sends a plain value transfer or raw call. */
async function performSend(
  chain: ChainProvider,
  to: Address,
  value: bigint,
  data?: Hex,
  options: WriteOptions = {},
) {
  const { signal } = options;
  signal?.throwIfAborted();
  const account = requireAccount(chain);
  const request = { account, to, ...(value > ZERO ? { value } : {}), ...(data ? { data } : {}) };
  if (chain.mode === "dry-run") {
    const gas = await chain.reader.estimateGas(request);
    return { simulated: true, gas: gas.toString() };
  }
  const signer = requireSigner(chain);
  const hash = await signer.sendTransaction({
    to,
    ...(value > ZERO ? { value } : {}),
    ...(data ? { data } : {}),
  });
  options.checkpoint?.({ receipt: { simulated: false, hash } });
  const receipt = await chain.reader.waitForTransactionReceipt(hash);
  if (receipt.status !== "success") throw new NodeExecutionError(`Transaction ${hash} reverted`);
  return { simulated: false, hash, ...(jsonSafe(receipt) as object) };
}

async function erc20Transfer(
  chain: ChainProvider,
  token: Address,
  to: Address,
  rawAmount: unknown,
  options: WriteOptions = {},
) {
  const decimals = Number(
    await chain.reader.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  );
  const units = amount(rawAmount, decimals, "Amount");
  const call: ContractCall = {
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, units],
  };
  return {
    token,
    to,
    amount: formatUnits(units, decimals),
    ...(await performWrite(chain, call, ZERO, {
      signal: options.signal,
      checkpoint: options.checkpoint,
      validateResult: (result) => {
        if (result === false) throw new NodeExecutionError("Token transfer returned false");
      },
    })),
  };
}

function requireUsdc(chain: ChainProvider): Address {
  if (!chain.usdcAddress)
    throw new NodeExecutionError(`No USDC contract is configured for ${chain.chainName}`);
  return chain.usdcAddress;
}

export const onchainExecutors: ExecutorRegistry = {
  "onchain.read-contract": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const call = buildCall(context.config(readContractConfigSchema));
      return { result: jsonSafe(await guarded(() => chain.reader.readContract(call))) };
    },
  },

  "onchain.write-contract": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(writeContractConfigSchema);
      const call = buildCall(config);
      const value = amount(config.value || "0", 18, "Value");
      return { receipt: await guarded(() => performWrite(chain, call, value, context)) };
    },
  },

  "onchain.transfer-token": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(transferTokenConfigSchema);
      const to = address(config.to, "Recipient");
      if (!config.token.trim()) {
        const value = amount(config.amount, 18, "Amount");
        return {
          receipt: await guarded(() => performSend(chain, to, value, undefined, context)),
        };
      }
      const token = address(config.token, "Token address");
      return {
        receipt: await guarded(() => erc20Transfer(chain, token, to, config.amount, context)),
      };
    },
  },

  "onchain.sign-message": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const { message } = context.config(signMessageConfigSchema);
      const text = typeof message === "string" ? message : JSON.stringify(message);
      if (!text) throw new NodeExecutionError("Sign message needs a message");
      const signer = requireSigner(chain);
      return { signature: await guarded(() => signer.signMessage(text)) };
    },
  },

  "privy.wallet": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      return {
        wallet: {
          address: requireAccount(chain),
          chainId: chain.chainId,
          chainName: chain.chainName,
        },
      };
    },
  },

  "privy.sign-transaction": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(signTransactionConfigSchema);
      const to = address(config.to, "Recipient");
      const value = amount(config.value || "0", 18, "Value");
      const data = config.data.trim();
      if (data && !isHex(data)) throw new NodeExecutionError("Calldata must be hex");
      const signer = requireSigner(chain);
      const signed = await guarded(() =>
        signer.signTransaction({
          to,
          ...(value > ZERO ? { value } : {}),
          ...(data ? { data: data as Hex } : {}),
        }),
      );
      return { signed };
    },
  },

  "usdc.payment": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(usdcPaymentConfigSchema);
      const to = address(config.to, "Recipient");
      return {
        receipt: await guarded(() =>
          erc20Transfer(chain, requireUsdc(chain), to, config.amount, context),
        ),
      };
    },
  },

  "usdc.payout": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(usdcTransferConfigSchema);
      const to = address(config.to, "Recipient");
      return {
        receipt: await guarded(() =>
          erc20Transfer(chain, requireUsdc(chain), to, config.amount, context),
        ),
      };
    },
  },

  "usdc.balance": {
    kind: "step",
    async run(context) {
      const chain = requireChain(context);
      const config = context.config(usdcBalanceConfigSchema);
      const owner = config.address.trim()
        ? address(config.address, "Address")
        : requireAccount(chain);
      const token = requireUsdc(chain);
      const [raw, decimals] = await guarded(() =>
        Promise.all([
          chain.reader.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
          chain.reader.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
        ]),
      );
      const units = BigInt(raw as bigint);
      return {
        balance: {
          address: owner,
          raw: units.toString(),
          formatted: formatUnits(units, Number(decimals)),
        },
      };
    },
  },
};
