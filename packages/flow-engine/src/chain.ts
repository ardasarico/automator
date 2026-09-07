import type { Abi, Address, Hex } from "viem";

/**
 * The engine's view of a chain, injected per run like the language model. `reader` answers
 * from a public RPC; `signer` is present only when the host can sign for `account` (Privy
 * server signing with the user's embedded wallet). In `dry-run` mode writes are simulated
 * and nothing is broadcast; `live` sends real transactions and waits for receipts.
 */
export type ChainMode = "dry-run" | "live";

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface TransactionReceiptSummary {
  transactionHash: Hex;
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
}

export interface ChainReader {
  readContract(call: ContractCall): Promise<unknown>;
  /** Runs the call as `account` without sending it; throws a revert like the network would. */
  simulateContract(call: ContractCall & { account: Address; value?: bigint }): Promise<unknown>;
  estimateContractGas(call: ContractCall & { account: Address; value?: bigint }): Promise<bigint>;
  estimateGas(request: {
    account: Address;
    to: Address;
    value?: bigint;
    data?: Hex;
  }): Promise<bigint>;
  getBalance(address: Address): Promise<bigint>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceiptSummary>;
}

export interface ChainSigner {
  address: Address;
  writeContract(call: ContractCall & { value?: bigint }): Promise<Hex>;
  sendTransaction(request: { to: Address; value?: bigint; data?: Hex }): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  /** Fills in nonce, gas and fees, then signs without broadcasting. */
  signTransaction(request: { to: Address; value?: bigint; data?: Hex }): Promise<Hex>;
}

export interface ChainProvider {
  chainId: number;
  chainName: string;
  mode: ChainMode;
  reader: ChainReader;
  /** The user's wallet address, when the run has a user. */
  account?: Address;
  signer?: ChainSigner;
  /** Why `signer` is absent, shown when a node needs it. */
  signerUnavailableReason?: string;
  /** The USDC contract on this chain, for the usdc.* nodes. */
  usdcAddress?: Address;
}
