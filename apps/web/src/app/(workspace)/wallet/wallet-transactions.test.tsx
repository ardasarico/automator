/// <reference types="bun" />
import type { WalletTransaction } from "@automator/contracts";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { nodeTypeLabel, shortHash, WalletTransactions } from "./wallet-transactions";

const hash = `0x${"ab".repeat(32)}`;
const transaction: WalletTransaction = {
  hash,
  chainId: 4801,
  flowId: "flow-1",
  flowName: "Payout",
  runId: "run 1",
  nodeId: "send",
  nodeType: "usdc.payout",
  at: "2026-09-07T10:00:01.000Z",
};

test("labels node types from the catalog and shortens hashes", () => {
  expect(nodeTypeLabel("usdc.payout")).toBe("USDC payout");
  expect(nodeTypeLabel("legacy.node")).toBe("legacy.node");
  expect(shortHash(hash)).toBe("0xababab…ababab");
});

test("rows link the run on its canvas and the hash on the chain's explorer", () => {
  const html = renderToString(<WalletTransactions transactions={[transaction]} />);
  expect(html).toContain('href="/flows/flow-1?run=run%201"');
  expect(html).toContain("Payout");
  expect(html).toContain("USDC payout");
  expect(html).toContain("World Chain Sepolia");
  expect(html).toContain(`href="https://worldchain-sepolia.explorer.alchemy.com/tx/${hash}"`);
  expect(html).toContain('dateTime="2026-09-07T10:00:01.000Z"');
  expect(html).not.toContain("No transactions yet");
});

test("says transactions follow live runs when there are none", () => {
  const html = renderToString(<WalletTransactions transactions={[]} />);
  expect(html).toContain("No transactions yet");
  expect(html).toContain("after a live run sends one");
  expect(html).not.toContain("<table");
});
