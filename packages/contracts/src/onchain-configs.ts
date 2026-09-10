import { Type, type Static } from "@sinclair/typebox";

/*
 * These are the settings that move funds, so every field names its unit and what it expects.
 * `title` replaces the label the builder would otherwise derive from the property key, and
 * `contentMediaType` asks it for a checked JSON editor instead of a single-line input.
 */
const text = (fallback = "", hints: Record<string, unknown> = {}) =>
  Type.String({ default: fallback, ...hints });

const json = (fallback: string, title: string, description: string) =>
  text(fallback, { title, description, contentMediaType: "application/json" });

const contractAddress = (description: string, fallback = "") =>
  text(fallback, { title: "Contract address", description });

const recipient = (description: string, fallback = "") =>
  text(fallback, { title: "Recipient address", description });

/* The engine parses amounts as whole tokens, never as the smallest unit. */
const amount = (description: string, fallback = "0", hints: Record<string, unknown> = {}) =>
  text(fallback, { title: "Amount", description, ...hints });

export const contractCallConfigSchema = Type.Object({
  address: contractAddress("The contract to call, as a 0x address."),
  /* Not `json()`: the engine's `parseAbiText` takes either form, so asking the builder for a
   * checked JSON editor here reported a valid signature list as invalid. */
  abi: text("", {
    title: "ABI",
    description:
      "The contract ABI, as a JSON array or one human-readable signature per line, such as function decimals() view returns (uint8). Only the function you call has to be in it.",
  }),
  functionName: text("", {
    title: "Function",
    description: "The function to call, spelled exactly as the ABI declares it.",
  }),
  args: json(
    "[]",
    "Arguments",
    'The arguments as a JSON array, in the order the function declares them, such as ["0x…", "1"]. Use [] for none.',
  ),
});
export type ContractCallConfig = Static<typeof contractCallConfigSchema>;

export const readContractConfigSchema = contractCallConfigSchema;
export type ReadContractConfig = ContractCallConfig;

export const writeContractConfigSchema = Type.Object({
  ...contractCallConfigSchema.properties,
  value: amount(
    "Native currency to send with the call, in whole units such as 0.01 ETH — not wei. Leave 0 to send none.",
    "0",
    { advanced: true },
  ),
});
export type WriteContractConfig = Static<typeof writeContractConfigSchema>;

export const transferTokenConfigSchema = Type.Object({
  to: recipient("Who receives the transfer.", "{{input.wallet.address}}"),
  amount: amount(
    "How much to send, in whole tokens such as 1.5 — not the smallest unit.",
    "{{input.amount}}",
  ),
  token: text("", {
    title: "Token address",
    description: "The ERC-20 to send. Leave blank to send the chain's native currency.",
  }),
});
export type TransferTokenConfig = Static<typeof transferTokenConfigSchema>;

export const signMessageConfigSchema = Type.Object({
  message: text("{{input.message}}", {
    title: "Message",
    description: "The text to sign with the embedded wallet.",
  }),
});
export type SignMessageConfig = Static<typeof signMessageConfigSchema>;

export const signTransactionConfigSchema = Type.Object({
  to: recipient("The address the transaction is sent to."),
  value: amount(
    "Native currency to send, in whole units such as 0.01 ETH — not wei. Leave 0 to send none.",
  ),
  data: text("", {
    title: "Call data",
    description: "Encoded call data as a 0x hex string. Leave blank for a plain transfer.",
  }),
});
export type SignTransactionConfig = Static<typeof signTransactionConfigSchema>;

export const usdcTransferConfigSchema = Type.Object({
  to: recipient("Who receives the USDC.", "{{input.recipient}}"),
  amount: amount("How much USDC to send, in dollars such as 12.50.", "{{input.amount}}"),
});
export type UsdcTransferConfig = Static<typeof usdcTransferConfigSchema>;

/*
 * Collecting a payment is a visitor screen, not a transfer the owner signs: the mini-app shows the
 * request, the visitor pays from their own wallet, and the API verifies that exact transfer once
 * before the flow continues. `usdc.payout` remains the outgoing transfer the owner signs.
 */
export const usdcPaymentConfigSchema = Type.Object({
  title: text("", { description: "Blank shows the node label." }),
  description: text("", { description: "Shown under the title, above the amount." }),
  amount: amount("How much USDC to collect, in dollars such as 12.50.", "{{input.amount}}"),
  to: recipient("Who collects the payment. Leave blank to collect into your own wallet."),
  simulate: Type.Union([Type.Literal("paid"), Type.Literal("declined")], {
    default: "paid",
    advanced: true,
    description: "Which answer Simulate takes.",
  }),
});
export type UsdcPaymentConfig = Static<typeof usdcPaymentConfigSchema>;

/*
 * What a collected payment hands on. Both branches carry `paid`, so a following condition can read
 * `{{input.value.paid}}` whichever way the visitor went, the way the Selfie Check gate does.
 */
export interface UsdcPaymentCollected {
  paid: true;
  txHash: string;
  from: string;
  to: string;
  /** The amount in dollars, as the visitor was asked for it. */
  amount: string;
  chainId: number;
  /** Present only when Simulate or a dry run answered the screen instead of a visitor. */
  simulated?: true;
}

export interface UsdcPaymentDeclined {
  paid: false;
}

export const samplePaymentTxHash =
  "0x7d1af0c9e2b3546a8f0d2c1b4e6a9f3082c5d7e10b4a6389fd2c5b7e0a1934cd";
/** The wallet Simulate pays from: the sample visitor of `privy.login`. */
export const samplePayerAddress = "0x0000000000000000000000000000000000000001";
/** Where Simulate collects to when the screen leaves the recipient blank. */
export const sampleCollectorAddress = "0x0000000000000000000000000000000000000002";

export const sampleUsdcPaymentDeclined: UsdcPaymentDeclined = { paid: false };

export function sampleUsdcPayment(
  config: UsdcPaymentConfig,
  chainId: number,
): UsdcPaymentCollected {
  return {
    paid: true,
    simulated: true,
    txHash: samplePaymentTxHash,
    from: samplePayerAddress,
    to: config.to.trim() || sampleCollectorAddress,
    amount: config.amount,
    chainId,
  };
}

export const usdcBalanceConfigSchema = Type.Object({
  address: text("", {
    title: "Wallet address",
    description: "The wallet to read. Leave blank to read your own embedded wallet.",
  }),
});
export type UsdcBalanceConfig = Static<typeof usdcBalanceConfigSchema>;

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

export const onchainEventTriggerConfigSchema = Type.Object({
  address: Type.String({ default: "", description: "The contract that emits the event." }),
  event: Type.String({
    default: "Transfer(address indexed from, address indexed to, uint256 value)",
    description: "The event as a human-readable ABI signature.",
  }),
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
  "usdc.payment": usdcPaymentConfigSchema,
  "usdc.payout": usdcTransferConfigSchema,
  "usdc.balance": usdcBalanceConfigSchema,
} as const;
