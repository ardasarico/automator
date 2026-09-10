import { describe, expect, test } from "bun:test";
import {
  findSignerNodes,
  findSigningBlockers,
  isSignerNodeType,
  signerNodeTypes,
} from "./flow-checks";
import { flowNodeTypes, type FlowNode } from "./flows";
import {
  failureCode,
  miniAppFailureMessage,
  miniAppFundsFailureMessage,
  miniAppPaymentFailureMessage,
  visitorFailureMessage,
} from "./sessions";

function node(id: string, type: FlowNode["type"], label = id): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label, config: {} };
}

describe("signer nodes", () => {
  test("are exactly the executors that sign with the owner's wallet", () => {
    expect<string[]>([...signerNodeTypes].sort()).toEqual(
      [
        "onchain.write-contract",
        "onchain.transfer-token",
        "onchain.sign-message",
        "privy.sign-transaction",
        "usdc.payout",
      ].sort(),
    );
    for (const type of signerNodeTypes) expect(flowNodeTypes).toContain(type);
    expect(isSignerNodeType("usdc.payout")).toBe(true);
    // Collecting a payment spends the visitor's wallet, so it needs no signing from the owner.
    expect(isSignerNodeType("usdc.payment")).toBe(false);
    expect(isSignerNodeType("usdc.balance")).toBe(false);
    expect(isSignerNodeType("onchain.read-contract")).toBe(false);
  });

  test("findSignerNodes keeps document order and skips reads", () => {
    const nodes = [
      node("open", "trigger.miniapp-open"),
      node("pay", "usdc.payout", "Send USDC"),
      node("read", "usdc.balance"),
      node("sign", "onchain.sign-message", "Sign"),
    ];
    expect(findSignerNodes({ nodes }).map((entry) => entry.id)).toEqual(["pay", "sign"]);
    expect(findSignerNodes({ nodes: [node("open", "trigger.miniapp-open")] })).toEqual([]);
  });

  test("findSigningBlockers names each signer node in the activation problem shape", () => {
    const nodes = [
      node("open", "trigger.miniapp-open"),
      node("pay", "usdc.payout", "Send USDC"),
      { ...node("sign", "onchain.sign-message"), label: "" },
    ];
    expect(findSigningBlockers({ nodes })).toEqual([
      {
        severity: "error",
        nodeId: "pay",
        message: "“Send USDC” needs server signing, which is off for your wallet.",
      },
      {
        severity: "error",
        nodeId: "sign",
        message: "“onchain.sign-message” needs server signing, which is off for your wallet.",
      },
    ]);
    expect(
      findSigningBlockers({ nodes }, { fallbackLabel: (type) => `the ${type} node` })[1]!.message,
    ).toBe("“the onchain.sign-message node” needs server signing, which is off for your wallet.");
    expect(findSigningBlockers({ nodes: [node("open", "trigger.miniapp-open")] })).toEqual([]);
  });
});

describe("visitor failure messages", () => {
  test.each([
    [undefined, "node_failed"],
    ["Transaction 0xabc reverted", "node_failed"],
    ["The run was cancelled.", "cancelled"],
    ["timed out after 1000 ms", "timeout"],
    ["No chain is configured for this run", "unconfigured"],
    ['Secret "hook" is not defined', "unconfigured"],
    [
      "Server signing is not enabled for this wallet; enable the configured app signer",
      "unconfigured",
    ],
    ["Server signing is not configured on the API (PRIVY_AUTHORIZATION_KEY)", "unconfigured"],
  ])("classifies %p as %s", (error, code) => {
    expect<string>(failureCode(error)).toBe(code);
  });

  test("a signer node that is not set up reads as a funds problem, everything else stays generic", () => {
    expect(miniAppFundsFailureMessage).toBe(
      "This app can't send funds right now. Its owner has to finish setting it up first.",
    );
    expect(visitorFailureMessage("unconfigured", "usdc.payout")).toBe(miniAppFundsFailureMessage);
    expect(visitorFailureMessage("unconfigured", "onchain.write-contract")).toBe(
      miniAppFundsFailureMessage,
    );
    expect(visitorFailureMessage("unconfigured", "notify.discord")).toBe(miniAppFailureMessage);
    expect(visitorFailureMessage("node_failed", "usdc.payout")).toBe(miniAppFailureMessage);
    expect(visitorFailureMessage("unconfigured", undefined)).toBe(miniAppFailureMessage);
    expect(JSON.stringify([miniAppFundsFailureMessage, miniAppFailureMessage])).not.toMatch(
      /signer|Privy|wallet/i,
    );
  });

  test("a payment screen the owner has not set up says so in its own words", () => {
    expect(miniAppPaymentFailureMessage).toBe(
      "This app can't take payments right now. Its owner has to finish setting it up first.",
    );
    expect(visitorFailureMessage("unconfigured", "usdc.payment")).toBe(
      miniAppPaymentFailureMessage,
    );
    expect(visitorFailureMessage("node_failed", "usdc.payment")).toBe(miniAppFailureMessage);
    expect(miniAppPaymentFailureMessage).not.toMatch(/signer|Privy|wallet|USDC/i);
  });
});
