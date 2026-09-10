import { flowChainId, type FlowRunRecord, type WalletTransaction } from "@automator/contracts";

export const transactionScanLimit = 200;
export const transactionListLimit = 20;

/* What the owner's own wallet sent. A `usdc.payment` is the visitor's transfer, not theirs. */
const transactionNodeTypes = new Set([
  "onchain.write-contract",
  "onchain.transfer-token",
  "usdc.payout",
]);

function sentHash(receipt: unknown): string | undefined {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return;
  if (!("simulated" in receipt) || receipt.simulated !== false || !("hash" in receipt)) return;
  return typeof receipt.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(receipt.hash)
    ? receipt.hash
    : undefined;
}

export function collectWalletTransactions(
  records: readonly FlowRunRecord[],
  limit = transactionListLimit,
): WalletTransaction[] {
  const transactions: WalletTransaction[] = [];
  const seen = new Set<string>();
  for (const { run, flowName, document } of records) {
    const chainId = flowChainId(document);
    const nodes = new Map(document.nodes.map((node) => [node.id, node]));
    for (const result of run.nodes) {
      const node = nodes.get(result.nodeId);
      if (!node || !transactionNodeTypes.has(node.type) || result.status !== "succeeded") continue;
      const hash = sentHash(result.outputs?.receipt);
      if (!hash) continue;
      const key = `${chainId}:${hash.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
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
  return transactions.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}
