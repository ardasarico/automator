import type { PaymentPolicyOperation, PaymentPolicyStore } from "@automator/db";
import type { ChainSigner } from "@automator/flow-engine";
import { decodeFunctionData, encodeFunctionData, erc20Abi, isAddress, type Hex } from "viem";

type Transaction = Parameters<ChainSigner["sendTransaction"]>[0];

const unsupported = (reason: string): PaymentPolicyOperation => ({ kind: "unsupported", reason });

function paymentOperation(
  request: Transaction,
  chainId: number,
  usdcAddress: string | undefined,
): PaymentPolicyOperation {
  const value = request.value ?? 0n;
  if (!isAddress(request.to, { strict: false }) || value < 0n || value >= 2n ** 256n)
    return unsupported("Invalid payment destination or amount");
  const data = request.data ?? "0x";
  if (data === "0x")
    return {
      kind: "transfer",
      chainId,
      asset: "native",
      recipient: request.to.toLowerCase(),
      amount: value.toString(),
    };
  if (value !== 0n || request.to.toLowerCase() !== usdcAddress?.toLowerCase())
    return unsupported("Only direct native and configured USDC transfers are allowed");
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    if (decoded.functionName !== "transfer")
      return unsupported("Only direct USDC transfer calls are allowed");
    const [recipient, amount] = decoded.args;
    // viem accepts trailing bytes and nonzero address padding; require canonical encoding.
    const canonical = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, amount],
    });
    if (canonical.toLowerCase() !== data.toLowerCase())
      return unsupported("USDC transfer calldata must use canonical encoding");
    return {
      kind: "transfer",
      chainId,
      asset: "usdc",
      recipient: recipient.toLowerCase(),
      amount: amount.toString(),
    };
  } catch {
    return unsupported("The transaction is not a recognized direct USDC transfer");
  }
}

/**
 * Every signing attempt consults and reserves against the current durable policy. Once
 * admitted, a reservation stays charged even if signing or broadcast returns an error.
 */
export function createPaymentPolicySigner(
  signer: ChainSigner,
  ownerId: string,
  chainId: number,
  usdcAddress: string | undefined,
  store: Pick<PaymentPolicyStore, "reserve">,
): ChainSigner {
  async function authorize(operation: PaymentPolicyOperation) {
    await store.reserve(ownerId, operation);
  }
  return {
    address: signer.address,
    async writeContract(call) {
      const contract = structuredClone({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
        value: call.value,
      });
      let operation: PaymentPolicyOperation;
      try {
        const data = encodeFunctionData({
          abi: contract.abi,
          functionName: contract.functionName,
          args: contract.args,
        });
        operation = paymentOperation(
          { to: contract.address, value: contract.value, data },
          chainId,
          usdcAddress,
        );
      } catch {
        operation = unsupported("The contract call is not a recognized direct payment");
      }
      await authorize(operation);
      // Forward only the ChainSigner surface: no account, chain, calldata suffix or
      // authorization-list overrides can differ from the payment we admitted.
      return signer.writeContract(contract);
    },
    async sendTransaction(request) {
      const transaction = { to: request.to, value: request.value, data: request.data };
      await authorize(paymentOperation(transaction, chainId, usdcAddress));
      return signer.sendTransaction(transaction);
    },
    async signMessage(message) {
      await authorize(unsupported("Message signing is disabled while payment limits are enabled"));
      return signer.signMessage(message);
    },
    async signTransaction(request): Promise<Hex> {
      await authorize(
        unsupported("Offline transaction signing is disabled while payment limits are enabled"),
      );
      return signer.signTransaction({ to: request.to, value: request.value, data: request.data });
    },
  };
}
