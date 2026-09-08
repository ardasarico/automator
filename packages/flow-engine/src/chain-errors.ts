import { BaseError, ContractFunctionRevertedError } from "viem";

export function describeChainError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason ?? "";
      const args = reverted.data?.args?.length
        ? `(${reverted.data.args.map(String).join(", ")})`
        : "";
      return `Reverted${name ? `: ${name}${args}` : ""}`;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}
