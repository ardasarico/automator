import { flowDocumentSchema, Value } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { getCatalogEntry } from "./catalog";
import { exampleToFlowDocument, findFlowExample } from "./examples";

describe("exampleToFlowDocument", () => {
  test("maps ticket checkout to a trigger followed by one node per step", () => {
    const example = findFlowExample("ticket-checkout");
    expect(example).toBeDefined();
    const document = exampleToFlowDocument(example!, "flow-1");

    expect(document.id).toBe("flow-1");
    expect(document.name).toBe("Ticket checkout");
    expect(document.nodes.map((node) => node.type)).toEqual([
      "trigger.miniapp-open",
      "screen.page",
      "integration.world-selfie-check",
      "integration.privy-wallet",
      "screen.page",
    ]);
    expect(document.nodes.map((node) => node.label)).toEqual([
      "Mini-app opened",
      "Select a ticket",
      "Verify the visitor",
      "Collect payment",
      "Issue the ticket",
    ]);
  });

  test("chains nodes left to right through the first port on each side", () => {
    const document = exampleToFlowDocument(findFlowExample("payment-link")!, "flow-2");
    expect(document.edges).toHaveLength(document.nodes.length - 1);
    document.edges.forEach((edge, index) => {
      const source = document.nodes[index]!;
      const target = document.nodes[index + 1]!;
      expect(edge.source).toBe(source.id);
      expect(edge.target).toBe(target.id);
      expect(edge.sourceHandle).toBe(getCatalogEntry(source.type).outputs[0]!.id);
      expect(edge.targetHandle).toBe(getCatalogEntry(target.type).inputs[0]!.id);
    });
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
    const xs = document.nodes.map((node) => node.position.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(document.nodes.map((node) => node.position.y)).size).toBe(1);
  });

  test("recognises USDC from the step name", () => {
    const document = exampleToFlowDocument(findFlowExample("payment-link")!, "flow-3");
    expect(document.nodes.at(-1)?.type).toBe("integration.usdc-payment");
  });

  test.each(flowExamples.map((example) => example.id))("%s produces a valid document", (slug) => {
    const document = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
    expect(new Set(document.nodes.map((node) => node.id)).size).toBe(document.nodes.length);
  });

  test("findFlowExample returns undefined for unknown or missing slugs", () => {
    expect(findFlowExample("nope")).toBeUndefined();
    expect(findFlowExample(undefined)).toBeUndefined();
  });
});
