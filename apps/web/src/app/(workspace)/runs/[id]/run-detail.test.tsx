/// <reference types="bun" />
import type { FlowRunRecord } from "@automator/contracts";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { RunDetail } from "./run-detail";

const hash = `0x${"ab".repeat(32)}`;

/** trigger → payout → discord: the payout sent a transaction, Discord refused the webhook. */
const record: FlowRunRecord = {
  flowName: "Payday",
  source: "schedule",
  document: {
    version: 1,
    id: "flow-1",
    name: "Payday",
    description: "",
    nodes: [
      { id: "t", type: "trigger.schedule", position: { x: 0, y: 0 }, label: "", config: {} },
      {
        id: "p",
        type: "usdc.payout",
        position: { x: 300, y: 0 },
        label: "Pay the team",
        config: {},
      },
      {
        id: "d",
        type: "notify.discord",
        position: { x: 600, y: 0 },
        label: "Announce",
        config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "paid" },
      },
      { id: "x", type: "notify.discord", position: { x: 600, y: 200 }, label: "Never", config: {} },
    ],
    edges: [
      { id: "e1", source: "t", sourceHandle: "tick", target: "p", targetHandle: "in" },
      { id: "e2", source: "p", sourceHandle: "receipt", target: "d", targetHandle: "message" },
    ],
  },
  run: {
    id: "run-1",
    flowId: "flow-1",
    status: "failed",
    startedAt: "2026-09-07T10:00:00.000Z",
    finishedAt: "2026-09-07T10:00:03.000Z",
    trigger: { nodeId: "t", payload: { at: "2026-09-07T10:00:00.000Z" } },
    nodes: [
      {
        nodeId: "t",
        status: "succeeded",
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:00.010Z",
        outputs: { tick: { at: "2026-09-07T10:00:00.000Z" } },
      },
      {
        nodeId: "p",
        status: "succeeded",
        startedAt: "2026-09-07T10:00:00.010Z",
        finishedAt: "2026-09-07T10:00:02.400Z",
        outputs: { receipt: { hash, amount: "5" } },
      },
      {
        nodeId: "d",
        status: "failed",
        startedAt: "2026-09-07T10:00:02.400Z",
        finishedAt: "2026-09-07T10:00:03.000Z",
        error: "Discord answered 401",
      },
      { nodeId: "x", status: "skipped" },
    ],
    variables: { paid: 5, note: "first batch" },
  },
};

const html = renderToString(<RunDetail record={record} />);

test("the header names the flow, the outcome, the trigger source and the canvas link", () => {
  expect(html).toContain("Payday");
  expect(html).toContain("Failed");
  expect(html).toContain("Schedule");
  expect(html).toContain("3.0s");
  expect(html).toContain('href="/flows/flow-1?run=run-1"');
  expect(html).toContain("Open on canvas");
  expect(html).toContain('href="/runs"');
});

test("the trigger section shows the node that fired and its payload", () => {
  const trigger = html.slice(html.indexOf('id="run-trigger"'), html.indexOf('id="run-steps"'));
  expect(trigger).toContain("Schedule");
  expect(trigger).toContain("&quot;at&quot;");
  expect(trigger).not.toContain("No payload");
});

test("every node is a step; failed ones start open with their error, others closed", () => {
  const steps = html.slice(html.indexOf('id="run-steps"'), html.indexOf('id="run-variables"'));
  const details = steps.split("<details").slice(1);
  expect(details).toHaveLength(4);
  const [trigger, payout, discord, skipped] = details as [string, string, string, string];
  expect(trigger).not.toContain(" open");
  expect(payout).not.toContain(" open");
  expect(discord).toContain(" open");
  expect(skipped).not.toContain(" open");
  expect(discord).toContain("Announce");
  expect(discord).toContain("Discord answered 401");
  expect(discord).toContain("Failed");
  expect(payout).toContain("Pay the team");
  expect(payout).toContain("Succeeded");
  expect(payout).toContain("2.4 s");
  expect(payout).toContain(`https://sepolia.basescan.org/tx/${hash}`);
  expect(payout).toContain("View on Base Sepolia");
  expect(skipped).toContain("Skipped");
  expect(skipped).toContain("No incoming edge fired");
});

test("final variables are listed as key and value rows", () => {
  const variables = html.slice(html.indexOf('id="run-variables"'));
  expect(variables).toContain("<dt>paid</dt>");
  expect(variables).toContain("<dt>note</dt>");
  expect(variables).toContain("&quot;first batch&quot;");
});

test("a run-level error is a callout, and an auto-answered screen says so", () => {
  const waiting: FlowRunRecord = {
    ...record,
    run: {
      ...record.run,
      status: "waiting",
      error: "The graph has a cycle",
      trigger: { nodeId: null },
      nodes: [
        { nodeId: "t", status: "succeeded", outputs: { next: {}, simulated: { port: "next" } } },
        { nodeId: "p", status: "waiting" },
      ],
      variables: {},
    },
  };
  const page = renderToString(<RunDetail record={waiting} />);
  expect(page).toContain("The graph has a cycle");
  expect(page).toContain("No trigger node fired.");
  expect(page).toContain("No payload");
  expect(page).toContain("Auto-answered");
  expect(page).toContain("continued on “next”");
  expect(page).toContain("The run stopped here until a visitor acts.");
  expect(page).not.toContain('id="run-variables"');
  const details = page.split("<details").slice(1);
  expect(details[1]).toContain(" open");
});
