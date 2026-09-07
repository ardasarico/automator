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
