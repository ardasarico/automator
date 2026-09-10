import { chains, explorerAddressUrl } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiExternalLinkLine, RiWallet3Line } from "@remixicon/react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../auth/server";
import { hasNoFunds, noFundsMessage } from "../../../builder/wallet-funds-check";
import { EmptyState } from "../../../components/empty-state";
import { PageFrame } from "../../../components/page-frame";
import { exactAmount, formatAmount } from "../../../wallet/amounts";
import { getWallet, listWalletTransactions, type WalletLookup } from "../../../wallet/server";
import { CopyAddressButton } from "./copy-address-button";
import { PaymentLimits } from "./payment-limits";
import { SigningAction, SigningLine, WalletSigningProvider } from "./wallet-signing";
import styles from "./wallet.module.css";
import { WalletTransactions } from "./wallet-transactions";

export const metadata: Metadata = { title: "Wallet · Automator" };

/**
 * The embedded wallet as one story: its address and signing state first, then what it holds,
 * what governs its spending, and what recent runs sent. Each chain is read on its own, so one
 * unreachable RPC only marks that balance unavailable; with every RPC down the address still
 * comes from the session, which mirrors it.
 */
export default async function WalletPage() {
  const [user, lookups, transactions] = await Promise.all([
    requireUser(),
    Promise.all(chains.map((chain) => getWallet(chain.id))),
    listWalletTransactions(),
  ]);
  const wallet = lookups.find((lookup) => lookup.status === "ok")?.wallet;
  const address = wallet?.address ?? user.walletAddress;
  if (!address || lookups.every((lookup) => lookup.status === "missing")) return <NoWallet />;
  return (
    <WalletSigningProvider initial={wallet?.signing}>
      <PageFrame title="Wallet" actions={<SigningAction />}>
        <Identity address={address} />
        <Balances lookups={lookups} />
        <PaymentLimits />
        <WalletTransactions transactions={transactions} />
      </PageFrame>
    </WalletSigningProvider>
  );
}

function Identity({ address }: { address: string }) {
  const explorers = chains.flatMap((chain) => {
    const url = explorerAddressUrl(chain.id, address);
    return url ? [{ chain, url }] : [];
  });
  return (
    <section aria-labelledby="wallet-address-title" className={styles.identity}>
      <div>
        <h2 id="wallet-address-title" className={styles.identityTitle}>
          Embedded wallet
        </h2>
        <p className={styles.identityText}>Created by Privy when you signed in.</p>
      </div>
      <div className={styles.address}>
        <code dir="ltr">{address}</code>
        <CopyAddressButton address={address} />
      </div>
      {explorers.length > 0 && (
        <ul className={styles.explorers}>
          {explorers.map(({ chain, url }) => (
            <li key={chain.id}>
              <a href={url} target="_blank" rel="noreferrer">
                {chain.name} explorer
                <RiExternalLinkLine aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <SigningLine />
    </section>
  );
}

/** A balance rounded for reading, with the exact chain value on hover when digits were dropped. */
function Amount({ value, symbol }: { value: string; symbol: string }) {
  const shown = formatAmount(value);
  const exact = exactAmount(value, shown);
  return (
    <li className={styles.amount} title={exact ? `${exact} ${symbol}` : undefined}>
      {shown}
      <span>{symbol}</span>
    </li>
  );
}

function Balances({ lookups }: { lookups: readonly WalletLookup[] }) {
  return (
    <section aria-labelledby="wallet-balances-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="wallet-balances-title" className={styles.sectionTitle}>
          Balances
        </h2>
      </div>
      <ul className={styles.tiles}>
        {chains.map((chain, index) => {
          const lookup = lookups[index];
          return (
            <li key={chain.id} className={styles.tile}>
              <h3 className={styles.tileChain}>{chain.name}</h3>
              {lookup?.status === "ok" ? (
                <>
                  <ul className={styles.amounts} aria-label={`Balances on ${chain.name}`}>
                    <Amount
                      value={lookup.wallet.nativeBalance}
                      symbol={lookup.wallet.nativeSymbol}
                    />
                    {lookup.wallet.usdcBalance !== undefined && (
                      <Amount value={lookup.wallet.usdcBalance} symbol="USDC" />
                    )}
                  </ul>
                  {hasNoFunds(lookup.wallet) && (
                    <p className={styles.tileNote}>{noFundsMessage(chain.id)}</p>
                  )}
                </>
              ) : (
                <p className={styles.tileNote} data-tone="muted" role="status">
                  {lookup?.status === "missing" ? "No wallet on this chain" : "Unavailable"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Shown when no chain knows the wallet: the account has none yet. */
function NoWallet() {
  return (
    <PageFrame title="Wallet">
      <EmptyState
        icon={<RiWallet3Line />}
        titleId="wallet-empty-title"
        title="No wallet yet"
        text="Privy creates your embedded wallet on first sign-in. Sign out and back in if it has not appeared, then come back to fund it and watch what your flows send."
        action={
          <Button variant="outline" render={<Link href="/flows" />}>
            Go to flows
          </Button>
        }
      />
      <PaymentLimits />
    </PageFrame>
  );
}
