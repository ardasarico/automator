import { chainName, explorerTransactionUrl, type WalletTransaction } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiErrorWarningLine, RiExchangeLine, RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { getCatalogEntry, isFlowNodeType } from "../../../builder/catalog";
import styles from "../flows/flows.module.css";
import { LocalTime } from "../runs/local-time";
import walletStyles from "./wallet.module.css";

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function nodeTypeLabel(type: string): string {
  return isFlowNodeType(type) ? getCatalogEntry(type).label : type;
}

export function WalletTransactions({
  transactions,
}: {
  transactions: readonly WalletTransaction[] | null;
}) {
  return (
    <section aria-labelledby="wallet-transactions-title" className={walletStyles.section}>
      <div className={walletStyles.sectionHead}>
        <h2 id="wallet-transactions-title" className={walletStyles.sectionTitle}>
          Recent transactions
        </h2>
      </div>
      {transactions === null ? (
        <div className={styles.empty}>
          <EmptyStateIllustration icon={<RiErrorWarningLine />} />
          <p className="mt-6 text-panel text-balance" role="status">
            Recent transactions could not load
          </p>
          <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
            Transaction history is temporarily unavailable. Try again to check your recent runs.
          </p>
          <form action="/wallet" method="get" className="mt-6">
            <Button variant="outline" type="submit">
              Try again
            </Button>
          </form>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.empty}>
          <EmptyStateIllustration icon={<RiExchangeLine />} />
          <p className="mt-6 text-panel text-balance">No transactions yet</p>
          <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
            Transactions appear here after a live run sends one from this wallet.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">
              Transactions your runs sent from this wallet, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Node</th>
                <th scope="col">Chain</th>
                <th scope="col">Sent</th>
                <th scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const explorer = explorerTransactionUrl(transaction.chainId, transaction.hash);
                return (
                  <tr key={`${transaction.chainId}:${transaction.hash.toLowerCase()}`}>
                    <th scope="row">
                      <Link
                        href={`/flows/${transaction.flowId}?run=${encodeURIComponent(transaction.runId)}`}
                        className={styles.tableFlow}
                        aria-label={`Open ${transaction.flowName} with this run`}
                      >
                        <span className={styles.flowName}>{transaction.flowName}</span>
                      </Link>
                    </th>
                    <td>{nodeTypeLabel(transaction.nodeType)}</td>
                    <td>{chainName(transaction.chainId)}</td>
                    <td>
                      <LocalTime value={transaction.at} />
                    </td>
                    <td>
                      {explorer ? (
                        <a
                          href={explorer}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm text-code hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                          title={transaction.hash}
                        >
                          {shortHash(transaction.hash)}
                          <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
                          <span className="sr-only"> (opens the block explorer)</span>
                        </a>
                      ) : (
                        <code className="text-code" title={transaction.hash}>
                          {shortHash(transaction.hash)}
                        </code>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
