import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

/**
 * The signed-in user's embedded wallet on one chain: its address, balances as decimal strings
 * in the token's own unit ("0.05" ETH, "12.5" USDC; `usdcBalance` is absent on a chain with
 * no USDC), and `signing`, whether the API's server signer is granted on the wallet, present
 * only when the API can tell (it has an authorization key).
 */
export const walletSchema = Type.Object({
  address: Type.String({ minLength: 1 }),
  chainId: Type.Integer(),
  chainName: Type.String(),
  nativeBalance: Type.String(),
  nativeSymbol: Type.String(),
  usdcBalance: Type.Optional(Type.String()),
  signing: Type.Optional(Type.Boolean()),
});
export type Wallet = Static<typeof walletSchema>;

/**
 * `?chainId=` picks a registry chain, the default one otherwise; an id off the registry is
 * 400, an account without an embedded wallet 404, and an unreachable RPC 503.
 */
export const getWalletContract = {
  method: "GET",
  path: "/wallet",
  query: Type.Object({ chainId: Type.Optional(Type.String()) }),
  response: { 200: walletSchema, ...apiErrorResponses },
} as const;

/**
 * One transaction a stored run sent from the embedded wallet, found in a node's outputs.
 * `at` is when the node finished, or the run's start when the node carries no timestamp.
 */
export const walletTransactionSchema = Type.Object({
  hash: Type.String({ pattern: "^0x[0-9a-fA-F]{64}$" }),
  chainId: Type.Integer(),
  flowId: Type.String({ minLength: 1 }),
  flowName: Type.String(),
  runId: Type.String({ minLength: 1 }),
  nodeId: Type.String({ minLength: 1 }),
  nodeType: Type.String({ minLength: 1 }),
  at: Type.String(),
});
export type WalletTransaction = Static<typeof walletTransactionSchema>;

/**
 * The caller's most recent onchain transactions, newest first and at most twenty, derived
 * from their stored runs. 503 when runs are not stored.
 */
export const getWalletTransactionsContract = {
  method: "GET",
  path: "/wallet/transactions",
  response: {
    200: Type.Object({ transactions: Type.Array(walletTransactionSchema) }),
    ...apiErrorResponses,
  },
} as const;
