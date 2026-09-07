import { findFlowDocumentProblem, flowDocumentSchema, Value } from "@automator/contracts";
import { createStubChain, runFlow, type LanguageModel } from "@automator/flow-engine";
import { describe, expect, test } from "bun:test";
import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { getCatalogEntry } from "./catalog";
import { exampleToFlowDocument, findFlowExample } from "./examples";

const slugs = flowExamples.map((example) => example.id);

/**
 * The AI examples run against a scripted model (a label for Classify's JSON-schema request,
 * prose otherwise) and the USDC examples against a stub chain.
 */
const model: LanguageModel = async (request) => ({
  content:
    request.responseFormat?.type === "json_schema"
      ? JSON.stringify({ label: "bug" })
      : "Two sentences.",
  toolCalls: [],
});
/** What a trigger receives in the simulation; the payout webhook needs a recipient. */
const payloads: Record<string, unknown> = {
  "usdc-payout": { to: "0x2222222222222222222222222222222222222222", amount: "1.5" },
};

describe("exampleToFlowDocument", () => {
  test.each(slugs)("%s is a consistent document with fresh ids", (slug) => {
    const document = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    expect(document.id).toBe("flow");
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
    expect(findFlowDocumentProblem(document)).toBeNull();
    // Two forks never share an id.
    const again = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    for (const node of document.nodes)
      expect(again.nodes.some((other) => other.id === node.id)).toBe(false);
  });

  test.each(slugs)("%s edges name existing catalog ports", (slug) => {
    const document = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    const byId = new Map(document.nodes.map((node) => [node.id, node]));
    for (const edge of document.edges) {
      const source = getCatalogEntry(byId.get(edge.source)!.type);
      const target = getCatalogEntry(byId.get(edge.target)!.type);
      expect(source.outputs.map((port) => port.id)).toContain(edge.sourceHandle ?? "");
      expect(target.inputs.map((port) => port.id)).toContain(edge.targetHandle ?? "");
    }
  });

  test.each(slugs)("%s simulates green or stops at a screen from a fresh fork", async (slug) => {
    const document = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    const run = await runFlow(document, {
      trigger: { payload: payloads[slug] ?? {} },
      sleep: async () => {},
      model,
      chain: createStubChain(),
    });
    expect(run.error).toBeUndefined();
    const failed = run.nodes.filter((node) => node.status === "failed");
    if (failed.length === 0) {
      expect(["succeeded", "waiting"]).toContain(run.status);
      return;
    }
    // The one failure a fresh fork may show: the Discord node waiting for its own webhook.
    expect(failed).toHaveLength(1);
    const node = document.nodes.find((entry) => entry.id === failed[0]!.nodeId)!;
    expect(node.type).toBe("notify.discord");
    expect(node.config.webhookUrl).toBe("");
    expect(failed[0]!.error).toBe("Discord message needs a Discord webhook URL");
  });

  test("the audience gate takes the guest branch and the reminder rehearses", async () => {
    const gate = exampleToFlowDocument(findFlowExample("audience-gate")!, "flow");
    const gateRun = await runFlow(gate, { trigger: { payload: {} } });
    const statusOf = (label: string) =>
      gateRun.nodes.find((result) => {
        const node = gate.nodes.find((item) => item.id === result.nodeId);
        return node?.label === label;
      })?.status;
    expect(statusOf("Is a member?")).toBe("succeeded");
    expect(statusOf("Welcome back")).toBe("skipped");
    expect(statusOf("Join the waitlist")).toBe("waiting");

    const reminder = exampleToFlowDocument(findFlowExample("scheduled-reminder")!, "flow");
    const reminderRun = await runFlow(reminder, {
      trigger: { payload: {} },
      sleep: async () => {},
    });
    expect(reminderRun.status).toBe("succeeded");
    expect(reminderRun.variables).toEqual({ dryRun: "yes" });

    // The balance alert takes the low branch on the stub's 5 USDC, so it reaches Discord.
    const alert = exampleToFlowDocument(findFlowExample("usdc-balance-alert")!, "flow");
    const alertRun = await runFlow(alert, { trigger: { payload: {} }, chain: createStubChain() });
    expect(alertRun.nodes.map((node) => node.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
      "failed",
    ]);
  });

  test("the support triage takes the branch the model's label picks", async () => {
    const triage = exampleToFlowDocument(findFlowExample("support-triage")!, "flow");
    const run = await runFlow(triage, { trigger: { payload: {} }, screens: "auto", model });
    const statusOf = (label: string) =>
      run.nodes.find((result) => {
        const node = triage.nodes.find((item) => item.id === result.nodeId);
        return node?.label === label;
      })?.status;
    expect(run.variables).toEqual({
      message: "The payout button does nothing when I tap it on Base Sepolia.",
    });
    expect(statusOf("Sort the message")).toBe("succeeded");
    expect(statusOf("Is a bug?")).toBe("succeeded");
    expect(statusOf("Report the bug")).toBe("failed");
    expect(statusOf("Is a question?")).toBe("skipped");
    expect(statusOf("Share the feedback")).toBe("skipped");
    const bug = triage.nodes.find((node) => node.label === "Report the bug")!;
    expect(run.nodes.find((result) => result.nodeId === bug.id)?.error).toBe(
      "Discord message needs a Discord webhook URL",
    );
  });

  test("findFlowExample returns undefined for unknown or missing slugs", () => {
    expect(findFlowExample("nope")).toBeUndefined();
    expect(findFlowExample(undefined)).toBeUndefined();
  });
});
