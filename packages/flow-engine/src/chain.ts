import type { Abi, Address, Hex } from "viem";

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
  signTransaction(request: { to: Address; value?: bigint; data?: Hex }): Promise<Hex>;
}

export interface ChainProvider {
  chainId: number;
  chainName: string;
  mode: ChainMode;
  reader: ChainReader;
  account?: Address;
  signer?: ChainSigner;
  signerUnavailableReason?: string;
  usdcAddress?: Address;
}
