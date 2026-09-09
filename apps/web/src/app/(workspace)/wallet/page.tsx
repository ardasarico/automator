import { chains, explorerAddressUrl } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiExternalLinkLine, RiWallet3Line } from "@remixicon/react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../auth/server";
import { hasNoFunds, noFundsMessage } from "../../../builder/wallet-funds-check";
import { PageFrame } from "../../../components/page-frame";
import { exactAmount, formatAmount } from "../../../wallet/amounts";
import { getWallet, listWalletTransactions, type WalletLookup } from "../../../wallet/server";
import flowStyles from "../flows/flows.module.css";
import { CopyAddressButton } from "./copy-address-button";
import { PaymentLimits } from "./payment-limits";
import { SigningStatus } from "./signing-status";
import styles from "./wallet.module.css";
import { WalletTransactions } from "./wallet-transactions";

export const metadata: Metadata = { title: "Wallet · Automator" };

/**
 * The embedded wallet: its address, the server-signing grant, balances per registry chain,
 * and the transactions recent runs sent. Each chain is read on its own, so one unreachable
 * RPC only marks that card unavailable; with every RPC down the address still comes from the
 * session, which mirrors it.
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
    <PageFrame title="Wallet">
      <AddressCard address={address} signing={wallet?.signing} />
      <Balances lookups={lookups} />
      <PaymentLimits />
      <WalletTransactions transactions={transactions} />
    </PageFrame>
  );
}

function AddressCard({ address, signing }: { address: string; signing: boolean | undefined }) {
  const explorers = chains.flatMap((chain) => {
    const url = explorerAddressUrl(chain.id, address);
    return url ? [{ chain, url }] : [];
  });
  return (
    <section aria-labelledby="wallet-address-title">
      <div className={styles.card}>
        <div>
          <h2 id="wallet-address-title" className="text-label">
            Embedded wallet
          </h2>
          <p className="mt-1 text-caption text-muted-foreground">
            Created by Privy when you signed in.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code dir="ltr" className="min-w-0 text-code wrap-anywhere">
            {address}
          </code>
          <CopyAddressButton address={address} />
        </div>
        {explorers.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {explorers.map(({ chain, url }) => (
              <li key={chain.id}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  View on {chain.name} explorer
                  <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <SigningStatus signing={signing} />
      </div>
    </section>
  );
}

/** A balance rounded for reading, with the exact chain value on hover when digits were dropped. */
function Amount({ value, symbol }: { value: string; symbol: string }) {
  const shown = formatAmount(value);
  const exact = exactAmount(value, shown);
  return (
    <li className="text-body tabular-nums" title={exact ? `${exact} ${symbol}` : undefined}>
      {shown} {symbol}
    </li>
  );
}

function Balances({ lookups }: { lookups: readonly WalletLookup[] }) {
  return (
    <section aria-labelledby="wallet-balances-title" className={styles.section}>
      <h2 id="wallet-balances-title" className="text-label">
        Balances
      </h2>
      <ul className={`${styles.balances} mt-4`}>
        {chains.map((chain, index) => {
          const lookup = lookups[index];
          return (
            <li key={chain.id} className={styles.card}>
              <h3 className="text-label">{chain.name}</h3>
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
                    <p className="text-caption text-warning-foreground">
                      {noFundsMessage(chain.id)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-caption text-muted-foreground" role="status">
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
      <section className={flowStyles.empty} aria-labelledby="wallet-empty-title">
        <EmptyStateIllustration icon={<RiWallet3Line />} />
        <h2 id="wallet-empty-title" className="mt-6 text-panel text-balance">
          No wallet yet
        </h2>
        <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
          Privy creates your embedded wallet on first sign-in. Sign out and back in if it has not
          appeared, then come back to fund it and watch what your flows send.
        </p>
        <Button variant="outline" className="mt-6" render={<Link href="/flows" />}>
          Go to flows
        </Button>
      </section>
      <PaymentLimits />
    </PageFrame>
  );
}
