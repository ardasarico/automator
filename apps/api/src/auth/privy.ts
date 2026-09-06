import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";

export interface IdentityProvider {
  verify(token: string): Promise<{ id: string; expiresAt: number } | null>;
  walletAddress(id: string): Promise<string | null>;
}

export function createPrivyIdentity(
  appId: string | undefined,
  appSecret: string | undefined,
  verificationKey?: string,
): IdentityProvider | undefined {
  if (!appId || !appSecret) return undefined;
  const privy = new PrivyClient({
    appId,
    appSecret,
    jwtVerificationKey: verificationKey,
    timeout: 10_000,
    maxRetries: 0,
  });
  return {
    async verify(token) {
      try {
        const claims = await privy.utils().auth().verifyAccessToken(token);
        return { id: claims.user_id, expiresAt: claims.expiration };
      } catch (error) {
        if (error instanceof InvalidAuthTokenError) return null;
        throw error;
      }
    },
    async walletAddress(id) {
      const user = await privy.users()._get(id);
      const wallet = user.linked_accounts.find(
        (account) =>
          account.type === "wallet" &&
          account.chain_type === "ethereum" &&
          account.wallet_client_type === "privy",
      );
      return wallet && "address" in wallet ? wallet.address : null;
    },
  };
}
