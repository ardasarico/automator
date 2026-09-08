import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

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

export const getWalletContract = {
  method: "GET",
  path: "/wallet",
  query: Type.Object({ chainId: Type.Optional(Type.String()) }),
  response: { 200: walletSchema, ...apiErrorResponses },
} as const;

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

export const getWalletTransactionsContract = {
  method: "GET",
  path: "/wallet/transactions",
  response: {
    200: Type.Object({ transactions: Type.Array(walletTransactionSchema) }),
    ...apiErrorResponses,
  },
} as const;
