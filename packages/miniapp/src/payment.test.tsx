import type { FlowDocument, FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { shortAddress } from "./payment";
import { MiniApp } from "./mini-app";

function node(id: string, type: FlowNode["type"], label: string, config = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label, config };
}

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Paid report",
  description: "",
  nodes: [
    node("t", "trigger.miniapp-open", "Mini-app opened"),
    node("pay", "usdc.payment", "Pay for the report", {
      title: "One report",
      description: "Pay to generate it.",
      amount: "12.50",
    }),
    node("declining", "usdc.payment", "Pay", { amount: "1", simulate: "declined" }),
  ],
  edges: [{ id: "1", source: "t", target: "pay", sourceHandle: "visitor" }],
};

describe("the collect-payment screen", () => {
  test("shortens an address to its ends, so a visitor can compare it at a glance", () => {
    expect(shortAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e")).toBe("0x036C…CF7e");
    expect(shortAddress("0xabc")).toBe("0xabc");
  });

  test("names the price, the chain and who is collecting, with no host to pay through", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="pay" />);
    expect(html).toContain("One report");
    expect(html).toContain("Pay to generate it.");
    expect(html).toContain("12.50 USDC");
    expect(html).toContain('data-preview="usdc.payment"');
    expect(html).toContain("Preview: continues as paid.");
    const declining = renderToStaticMarkup(<MiniApp document={document} startAt="declining" />);
    expect(declining).toContain("Preview: continues as declined.");
  });

  test("falls back to the node label when the screen has no title of its own", () => {
    const untitled: FlowDocument = {
      ...document,
      nodes: [
        document.nodes[0]!,
        node("pay", "usdc.payment", "Pay for the report", { amount: "1" }),
      ],
    };
    expect(renderToStaticMarkup(<MiniApp document={untitled} startAt="pay" />)).toContain(
      "Pay for the report",
    );
  });

  test("shows a sample recipient and network in the preview, so the screen is not half-drawn", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="pay" />);
    expect(html).toContain("Base Sepolia");
    expect(html).toContain("Your wallet");
  });

  test("names the configured recipient in the preview when the flow sets one", () => {
    const explicit: FlowDocument = {
      ...document,
      nodes: [
        document.nodes[0]!,
        node("pay", "usdc.payment", "Pay", {
          amount: "1",
          to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        }),
      ],
    };
    expect(renderToStaticMarkup(<MiniApp document={explicit} startAt="pay" />)).toContain(
      "0x036C…CF7e",
    );
  });

  test("offers both a way to pay and a way to decline", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="pay" />);
    expect(html).toContain("Pay 12.50 USDC");
    expect(html).toContain("Not now");
  });
});
