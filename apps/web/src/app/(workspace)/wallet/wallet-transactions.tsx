import { chainName, explorerTransactionUrl, type WalletTransaction } from "@automator/contracts";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiExchangeLine, RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { getCatalogEntry, isFlowNodeType } from "../../../builder/catalog";
import styles from "../flows/flows.module.css";
import { LocalTime } from "../runs/local-time";

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** The catalog's label for the node that sent the transaction; the raw type off the catalog. */
export function nodeTypeLabel(type: string): string {
  return isFlowNodeType(type) ? getCatalogEntry(type).label : type;
}

/** What the caller's stored runs sent, newest first; each row opens the run on its canvas. */
export function WalletTransactions({
  transactions,
}: {
  transactions: readonly WalletTransaction[];
}) {
  return (
    <section aria-labelledby="wallet-transactions-title" className={styles.collection}>
      <h2 id="wallet-transactions-title" className="text-label">
        Recent transactions
      </h2>
      {transactions.length === 0 ? (
        <div className={styles.empty}>
          <EmptyStateIllustration icon={<RiExchangeLine />} />
          <p className="mt-6 text-panel text-balance">No transactions yet</p>
          <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
            Transactions appear here after a live run sends one from this wallet.
          </p>
        </div>
      ) : (
        <div className={`${styles.tableWrap} mt-4`}>
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
                  <tr key={transaction.hash}>
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
