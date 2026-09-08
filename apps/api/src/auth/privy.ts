import type { VisitorUser } from "@automator/contracts";
import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";

export interface EmbeddedWallet {
  /** Privy's wallet id, needed for server-side signing. */
  id: string;
  address: string;
  /** Privy's broad delegation flag; never proves this app's configured signer is granted. */
  delegated: boolean;
}

export interface IdentityProvider {
  verify(token: string): Promise<{ id: string; expiresAt: number } | null>;
  walletAddress(id: string): Promise<string | null>;
  /** The user's embedded Ethereum wallet with its Privy id; optional so test stubs stay small. */
  embeddedWallet?(id: string): Promise<EmbeddedWallet | null>;
  /**
   * Who a mini-app visitor is, from the access token the runtime's Privy login produced:
   * verified like a dashboard token, then described from the user's linked accounts. Null
   * for a rejected token. The token is read once and never stored.
   */
  visitor?(token: string): Promise<VisitorUser | null>;
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
  return createIdentity(privy);
}

/** Exported so tests can drive the error mapping with a stubbed client. */
export function createIdentity(privy: PrivyClient): IdentityProvider {
  const verify: IdentityProvider["verify"] = async (token) => {
    try {
      const claims = await privy.utils().auth().verifyAccessToken(token);
      return { id: claims.user_id, expiresAt: claims.expiration };
    } catch (error) {
      // The SDK reports a forged signature, a malformed token and a failed
      // JWKS fetch with the same class and message, so none of them can be
      // told apart here: every one of them is a rejected token. A verification
      // key is required in production precisely so the JWKS fetch never
      // happens and this ambiguity cannot cost a user their session.
      if (error instanceof InvalidAuthTokenError) return null;
      throw error;
    }
  };
  return {
    verify,
    async walletAddress(id) {
      return (await findEmbeddedWallet(privy, id))?.address ?? null;
    },
    async embeddedWallet(id) {
      return findEmbeddedWallet(privy, id);
    },
    async visitor(token) {
      const claims = await verify(token);
      if (!claims) return null;
      const user = await privy.users()._get(claims.id);
      return describeVisitor(claims.id, user.linked_accounts);
    },
  };
}

async function findEmbeddedWallet(privy: PrivyClient, id: string): Promise<EmbeddedWallet | null> {
  const user = await privy.users()._get(id);
  const wallet = user.linked_accounts.find(
    (account) =>
      account.type === "wallet" &&
      account.chain_type === "ethereum" &&
      account.wallet_client_type === "privy",
  );
  if (!wallet || !("address" in wallet)) return null;
  const walletId = "id" in wallet && typeof wallet.id === "string" ? wallet.id : null;
  if (!walletId) return null;
  return {
    id: walletId,
    address: wallet.address,
    delegated: "delegated" in wallet && wallet.delegated === true,
  };
}

/** The parts of a Privy linked account the visitor description reads; the SDK's union is wider. */
export interface LinkedAccountLike {
  type: string;
  address?: string | null;
  email?: string | null;
  chain_type?: string | null;
  wallet_client_type?: string | null;
  latest_verified_at?: number | null;
}

/** A linked account as one of the login methods the `privy.login` node offers. */
function loginMethodOf(account: LinkedAccountLike): string | null {
  switch (account.type) {
    case "email":
      return "email";
    case "google_oauth":
      return "google";
    case "passkey":
      return "passkey";
    case "wallet":
      // Embedded wallets are created by the app, never signed in with.
      return account.wallet_client_type === "privy" ? null : "wallet";
    default:
      return null;
  }
}

/**
 * The visitor the flow sees: their embedded wallet (else their first Ethereum wallet), their
 * email (else their Google address), and the login method of the account verified most
 * recently, which is the one they just signed in with. Blank strings where there is nothing.
 */
export function describeVisitor(
  userId: string,
  accounts: readonly LinkedAccountLike[],
): VisitorUser {
  const ethereum = accounts.filter(
    (account) => account.type === "wallet" && account.chain_type === "ethereum" && account.address,
  );
  const wallet =
    ethereum.find((account) => account.wallet_client_type === "privy")?.address ||
    ethereum[0]?.address ||
    "";
  const email =
    accounts.find((account) => account.type === "email")?.address ||
    accounts.find((account) => account.type === "google_oauth")?.email ||
    "";
  let loginMethod = "";
  let latest = -Infinity;
  for (const account of accounts) {
    const method = loginMethodOf(account);
    const verifiedAt = account.latest_verified_at ?? 0;
    if (method !== null && verifiedAt > latest) {
      latest = verifiedAt;
      loginMethod = method;
    }
  }
  return { userId, wallet, email, loginMethod };
}

/** The fixed user an end-to-end test signs in as; its wallet is synthetic and never signs. */
export const e2eUser = {
  id: "did:privy:e2e",
  walletAddress: "0x000000000000000000000000000000000000e2e1",
} as const;

/**
 * Accepts exactly `token` as the e2e user in front of the real provider, which still
 * answers every other token. Only wired when `E2E_TEST_TOKEN` is set, never in production.
 */
export function withE2eIdentity(
  identity: IdentityProvider | undefined,
  token: string | undefined,
): IdentityProvider | undefined {
  if (!token) return identity;
  return {
    async verify(candidate) {
      if (candidate === token) return { id: e2eUser.id, expiresAt: 4_102_444_800 };
      return identity ? identity.verify(candidate) : null;
    },
    async walletAddress(id) {
      if (id === e2eUser.id) return e2eUser.walletAddress;
      return identity ? identity.walletAddress(id) : null;
    },
    async embeddedWallet(id) {
      if (id === e2eUser.id)
        return { id: "e2e-wallet", address: e2eUser.walletAddress, delegated: false };
      return identity?.embeddedWallet ? identity.embeddedWallet(id) : null;
    },
    async visitor(candidate) {
      if (candidate === token)
        return {
          userId: e2eUser.id,
          wallet: e2eUser.walletAddress,
          email: "e2e@example.com",
          loginMethod: "email",
        };
      return identity?.visitor ? identity.visitor(candidate) : null;
    },
  };
}
