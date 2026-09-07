import { Type, type Static } from "@sinclair/typebox";

/**
 * Config schemas for the node types that touch a chain. Every string accepts `{{...}}`
 * templates; `abi` and `args` are JSON (or, for the ABI, human-readable signatures, one per
 * line) as text so the generic settings form can edit them. Amounts are decimal strings in the
 * token's own unit ("0.5" ETH, "12.25" USDC); the executor scales them by the token's decimals.
 */

const text = (fallback = "") => Type.String({ default: fallback });

export const contractCallConfigSchema = Type.Object({
  address: text(),
  abi: text(),
  functionName: text(),
  /** A JSON array of arguments, e.g. `["{{input.args.to}}", "1000000"]`. */
  args: text("[]"),
});
export type ContractCallConfig = Static<typeof contractCallConfigSchema>;

export const readContractConfigSchema = contractCallConfigSchema;
export type ReadContractConfig = ContractCallConfig;

export const writeContractConfigSchema = Type.Object({
  ...contractCallConfigSchema.properties,
  /** Native value sent with the call, in ETH. */
  value: text("0"),
});
export type WriteContractConfig = Static<typeof writeContractConfigSchema>;

export const transferTokenConfigSchema = Type.Object({
  to: text("{{input.wallet.address}}"),
  amount: text("{{input.amount}}"),
  /** Blank sends the chain's native coin; an address sends that ERC-20. */
  token: text(),
});
export type TransferTokenConfig = Static<typeof transferTokenConfigSchema>;

export const signMessageConfigSchema = Type.Object({
  message: text("{{input.message}}"),
});
export type SignMessageConfig = Static<typeof signMessageConfigSchema>;

export const signTransactionConfigSchema = Type.Object({
  to: text(),
  /** Native value in ETH. */
  value: text("0"),
  /** Calldata as hex; blank for a plain transfer. */
  data: text(),
});
export type SignTransactionConfig = Static<typeof signTransactionConfigSchema>;

export const usdcTransferConfigSchema = Type.Object({
  to: text("{{input.recipient}}"),
  /** USDC amount as a decimal string; USDC has six decimals. */
  amount: text("{{input.amount}}"),
});
export type UsdcTransferConfig = Static<typeof usdcTransferConfigSchema>;

export const usdcBalanceConfigSchema = Type.Object({
  /** Blank reads the user's own wallet. */
  address: text(),
});
export type UsdcBalanceConfig = Static<typeof usdcBalanceConfigSchema>;

export const onchainConfigSchemas = {
  "onchain.read-contract": readContractConfigSchema,
  "onchain.write-contract": writeContractConfigSchema,
  "onchain.transfer-token": transferTokenConfigSchema,
  "onchain.sign-message": signMessageConfigSchema,
  "privy.sign-transaction": signTransactionConfigSchema,
  "usdc.payment": usdcTransferConfigSchema,
  "usdc.payout": usdcTransferConfigSchema,
  "usdc.balance": usdcBalanceConfigSchema,
} as const;
