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

/** What the API hands an onchain-event trigger per decoded log; bigints travel as decimal strings. */
export const sampleEventPayload = {
  event: "Transfer",
  args: {
    from: "0x0000000000000000000000000000000000000000",
    to: "0x1111111111111111111111111111111111111111",
    value: "1000000",
  },
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  blockNumber: "12345678",
  blockHash: "0x5d8e2a1c0f7b4e9a3c6d1f2b8a7e4c3d9f0a1b2c3d4e5f60718293a4b5c6d7e8",
  transactionHash: "0x9f0a1b2c3d4e5f60718293a4b5c6d7e85d8e2a1c0f7b4e9a3c6d1f2b8a7e4c3d",
  logIndex: 3,
  chainId: 84532,
} as const;

/** The payload an onchain-event trigger receives per log; bigints travel as decimal strings. */
export interface OnchainEventPayload {
  event: string;
  args: Record<string, unknown>;
  address: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  chainId: number;
}

/**
 * The onchain-event trigger: the API polls the flow's chain for logs of `event` emitted by
 * `address` and starts one run per log with the decoded payload (see `sampleEventPayload`).
 */
export const onchainEventTriggerConfigSchema = Type.Object({
  address: Type.String({ default: "", description: "The contract that emits the event." }),
  event: Type.String({
    default: "Transfer(address indexed from, address indexed to, uint256 value)",
    description: "The event as a human-readable ABI signature.",
  }),
  /** Indexed argument filters as a JSON object; blank matches every log. */
  args: Type.String({
    default: "",
    description: 'Indexed argument filters as JSON, such as {"to": "0x..."}; blank matches all.',
  }),
  samplePayload: Type.String({
    default: JSON.stringify(sampleEventPayload, null, 2),
    description: "Payload Simulate hands to this trigger",
  }),
});
export type OnchainEventTriggerConfig = Static<typeof onchainEventTriggerConfigSchema>;

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
