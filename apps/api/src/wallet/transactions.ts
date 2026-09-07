import {
  flowChainId,
  isChainId,
  transactionHashes,
  type FlowRunRecord,
  type WalletTransaction,
} from "@automator/contracts";

/** How many stored runs the wallet scans, newest first, and how many transactions it lists. */
export const transactionScanLimit = 200;
export const transactionListLimit = 20;

/**
 * The transactions a batch of stored runs sent, newest first: every receipt hash in a node's
 * outputs, attributed to the node's chain (its config's `chainId` when it names a registry
 * chain, the document's chain otherwise) and timed by when the node finished. A hash seen
 * twice, say as a node output and again in a later node's input echo, is listed once.
 */
export function collectWalletTransactions(
  records: readonly FlowRunRecord[],
  limit = transactionListLimit,
): WalletTransaction[] {
  const transactions: WalletTransaction[] = [];
  const seen = new Set<string>();
  for (const { run, flowName, document } of records) {
    const nodes = new Map(document.nodes.map((node) => [node.id, node]));
    for (const result of run.nodes) {
      const node = nodes.get(result.nodeId);
      if (!node || !result.outputs) continue;
      const configChain = (node.config as { chainId?: unknown }).chainId;
      const chainId = isChainId(configChain) ? configChain : flowChainId(document);
      for (const output of Object.values(result.outputs)) {
        for (const hash of transactionHashes(output)) {
          if (seen.has(hash)) continue;
          seen.add(hash);
          transactions.push({
            hash,
            chainId,
            flowId: run.flowId,
            flowName,
            runId: run.id,
            nodeId: node.id,
            nodeType: node.type,
            at: result.finishedAt ?? run.startedAt,
          });
        }
      }
    }
  }
  return transactions.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}
