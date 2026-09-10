import type { FlowNodeType } from "./flows";

/**
 * The node types whose executor signs with the owner's wallet (`requireSigner` in the engine's
 * onchain executors). A run reaching one of them needs the owner's server signing to be on;
 * reads such as `usdc.balance` and `onchain.read-contract` do not.
 */
export const signerNodeTypes = [
  "onchain.write-contract",
  "onchain.transfer-token",
  "onchain.sign-message",
  "privy.sign-transaction",
  "usdc.payout",
] as const satisfies readonly FlowNodeType[];
export type SignerNodeType = (typeof signerNodeTypes)[number];

export function isSignerNodeType(type: FlowNodeType): type is SignerNodeType {
  return (signerNodeTypes as readonly FlowNodeType[]).includes(type);
}
