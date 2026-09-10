import {
  findFlowDocumentProblem,
  flowDocumentSchema,
  Value,
  type FlowDocument,
  type FlowRun,
} from "@automator/contracts";
import {
  createStubChain,
  runFlow,
  type DataProvider,
  type DataRecord,
  type LanguageModel,
} from "@automator/flow-engine";
import { describe, expect, test } from "bun:test";
import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { getCatalogEntry } from "./catalog";
import { exampleToFlowDocument, findFlowExample } from "./examples";

const slugs = flowExamples.map((example) => example.id);

const model: LanguageModel = async (request) => ({
  content:
    request.responseFormat?.type === "json_schema"
      ? JSON.stringify({ label: "bug" })
      : "Two sentences.",
  toolCalls: [],
});
const payloads: Record<string, unknown> = {
  "usdc-payout": { to: "0x2222222222222222222222222222222222222222", amount: "1.5" },
  "price-quote-api": { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
};
/** Stands in for The Graph gateway; anything else a fresh fork reaches is a wiring mistake. */
const poolAnswer = { data: { pool: { token0Price: "4012.5", totalValueLockedUSD: "250000000" } } };
const graph = { apiKey: "test-key" };
const fetchStub = (async (input: string | URL | Request) =>
  String(input).startsWith("https://gateway.thegraph.com/")
    ? Response.json(poolAnswer)
    : new Response("not stubbed", { status: 500 })) as typeof fetch;

describe("exampleToFlowDocument", () => {
  test.each(slugs)("%s is a consistent document with fresh ids", (slug) => {
    const document = exampleToFlowDocument(findFlowExample(slug)!, "flow");
    expect(document.id).toBe("flow");
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
    expect(findFlowDocumentProblem(document)).toBeNull();
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
      graph,
      fetch: fetchStub,
    });
    expect(run.error).toBeUndefined();
    const failed = run.nodes.filter((node) => node.status === "failed");
    if (failed.length === 0) {
      expect(["succeeded", "waiting"]).toContain(run.status);
      return;
    }
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

    const alert = exampleToFlowDocument(findFlowExample("usdc-balance-alert")!, "flow");
    const alertRun = await runFlow(alert, { trigger: { payload: {} }, chain: createStubChain() });
    expect(alertRun.nodes.map((node) => node.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
      "failed",
    ]);

    const watch = exampleToFlowDocument(findFlowExample("uniswap-pool-watch")!, "flow");
    const watchRun = await runFlow(watch, { trigger: { payload: {} }, graph, fetch: fetchStub });
    expect(watchRun.nodes.map((node) => node.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
      "failed",
    ]);
    expect(watchRun.nodes[1]!.outputs).toEqual(poolAnswer);
  });

  test("the selfie-gated claim pays a verified check and only a verified check", async () => {
    const claim = exampleToFlowDocument(findFlowExample("selfie-gated-claim")!, "flow");
    const statusOf = (run: FlowRun, label: string) =>
      run.nodes.find((result) => {
        const node = claim.nodes.find((item) => item.id === result.nodeId);
        return node?.label === label;
      })?.status;
    const paid = await runFlow(claim, {
      trigger: { payload: {} },
      screens: "auto",
      chain: createStubChain(),
    });
    expect(paid.status).toBe("succeeded");
    expect(statusOf(paid, "Selfie Check")).toBe("succeeded");
    expect(statusOf(paid, "Send USDC")).toBe("succeeded");
    expect(statusOf(paid, "Claimed")).toBe("succeeded");
    expect(statusOf(paid, "Not this time")).toBe("skipped");
    const payout = paid.nodes.find(
      (result) => statusOf(paid, "Send USDC") && result.outputs?.receipt,
    );
    expect(payout?.outputs?.receipt).toMatchObject({
      to: "0x0000000000000000000000000000000000000001",
      amount: "1",
    });

    const selfie = claim.nodes.find((node) => node.type === "world.selfie-check")!;
    const rejected = {
      ...claim,
      nodes: claim.nodes.map((node) =>
        node.id === selfie.id
          ? { ...node, config: { ...node.config, simulate: "rejected" } }
          : node,
      ),
    };
    const denied = await runFlow(rejected, {
      trigger: { payload: {} },
      screens: "auto",
      chain: createStubChain(),
    });
    expect(denied.status).toBe("succeeded");
    expect(statusOf(denied, "Send USDC")).toBe("skipped");
    expect(statusOf(denied, "Claimed")).toBe("skipped");
    expect(statusOf(denied, "Not this time")).toBe("succeeded");
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

  test("the applicant intake saves a new email and greets a known one", async () => {
    const columns = [
      { id: "name", name: "Name", type: "text", required: true },
      { id: "email", name: "Email", type: "text", required: true },
    ];
    const table = { id: "tbl", name: "Applicants", columns };
    /* A fresh fork has no table selected; picking one is the first thing the example asks for. */
    const withTable = () => {
      const document = exampleToFlowDocument(findFlowExample("applicant-intake")!, "flow");
      for (const node of document.nodes)
        if (node.type.startsWith("data.")) node.config = { ...node.config, tableId: table.id };
      return document;
    };
    const provider = (existing: readonly DataRecord[]) => {
      const created: Record<string, unknown>[] = [];
      const data: DataProvider = {
        mode: "live",
        table: async () => table,
        find: async () => existing,
        resolve: async () => existing[0] ?? null,
        create: async (_tableId, values) => {
          created.push(values);
          return {
            id: `rec-${created.length}`,
            tableId: table.id,
            values,
            createdAt: "2026-09-08T00:00:00.000Z",
            updatedAt: "2026-09-08T00:00:00.000Z",
          };
        },
        update: async () => {
          throw new Error("not used");
        },
        remove: async () => null,
      };
      return { data, created };
    };
    const statusOf = (document: FlowDocument, run: FlowRun, label: string) =>
      run.nodes.find((result) => {
        const node = document.nodes.find((item) => item.id === result.nodeId);
        return node?.label === label;
      })?.status;

    const fresh = withTable();
    const empty = provider([]);
    const firstRun = await runFlow(fresh, {
      trigger: { payload: {} },
      screens: "auto",
      data: empty.data,
    });
    expect(firstRun.error).toBeUndefined();
    expect(statusOf(fresh, firstRun, "Save the applicant")).toBe("succeeded");
    expect(statusOf(fresh, firstRun, "Welcome back")).toBe("skipped");
    expect(empty.created).toHaveLength(1);
    expect(Object.keys(empty.created[0]!).sort()).toEqual(["email", "name"]);

    const again = withTable();
    const known = provider([
      {
        id: "rec-1",
        tableId: table.id,
        values: { name: "Ada", email: "ada@example.com" },
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ]);
    const secondRun = await runFlow(again, {
      trigger: { payload: {} },
      screens: "auto",
      data: known.data,
    });
    expect(secondRun.error).toBeUndefined();
    expect(statusOf(again, secondRun, "Welcome back")).toBe("succeeded");
    expect(statusOf(again, secondRun, "Save the applicant")).toBe("skipped");
    expect(known.created).toHaveLength(0);
  });

  test("findFlowExample returns undefined for unknown or missing slugs", () => {
    expect(findFlowExample("nope")).toBeUndefined();
    expect(findFlowExample(undefined)).toBeUndefined();
  });
});
