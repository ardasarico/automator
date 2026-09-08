import type { Address, Hex } from "viem";
import type { ChainProvider } from "./chain";

const stubUser: Address = "0x1111111111111111111111111111111111111111";
const stubHash: Hex = "0xabc0000000000000000000000000000000000000000000000000000000000abc";

export function createStubChain(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    chainId: 84532,
    chainName: "Base Sepolia",
    mode: "dry-run",
    account: stubUser,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    reader: {
      async readContract(call) {
        if (call.functionName === "decimals") return 6;
        if (call.functionName === "balanceOf") return BigInt(5_000_000);
        if (call.functionName === "symbol") return "USDC";
        return BigInt(0);
      },
      async simulateContract() {
        return true;
      },
      async estimateContractGas() {
        return BigInt(40_000);
      },
      async estimateGas() {
        return BigInt(21_000);
      },
      async getBalance() {
        return BigInt(10) ** BigInt(18);
      },
      async waitForTransactionReceipt(hash) {
        return {
          transactionHash: hash,
          status: "success",
          blockNumber: BigInt(1),
          gasUsed: BigInt(30_000),
        };
      },
    },
    signer: {
      address: stubUser,
      async writeContract() {
        return stubHash;
      },
      async sendTransaction() {
        return stubHash;
      },
      async signMessage(message) {
        return `0x${Buffer.from(message).toString("hex")}` as Hex;
      },
      async signTransaction() {
        return stubHash;
      },
    },
    ...overrides,
  };
}
