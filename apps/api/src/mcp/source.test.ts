import { describe, expect, test } from "bun:test";
import { flowDocument, node } from "../api-publishing/test-support";
import { memoryStores } from "../runs/test-stores";
import { createCallableFlowSource } from "./source";

const alice = "did:privy:alice";
const bob = "did:privy:bob";

const quote = flowDocument(
  "flow-quote",
  "Price quote",
  [
    node("call", "trigger.api", {
      description: "Quote a swap",
      inputs: [{ name: "amount", type: "number", description: "How much", required: true }],
    }),
    node("out", "logic.return", { outputs: [{ name: "price", value: "{{input.value.amount}}0" }] }),
  ],
  [{ id: "e", source: "call", sourceHandle: "input", target: "out", targetHandle: "value" }],
);
const nightly = flowDocument("flow-nightly", "Nightly", [node("t", "trigger.schedule")]);
const draft = flowDocument("flow-draft", "Draft quote", [node("call", "trigger.api")]);

function source() {
  const stores = memoryStores([
    { ownerId: alice, flow: quote, enabled: true },
    { ownerId: alice, flow: nightly, enabled: true },
    { ownerId: alice, flow: draft, enabled: false },
    {
      ownerId: bob,
      flow: flowDocument("flow-bob", "Bob", [node("call", "trigger.api")]),
      enabled: true,
    },
  ]);
  return createCallableFlowSource({ flows: stores.flows, runs: stores.runs });
}

describe("the MCP flow source", () => {
  test("lists only the owner's active flows that start at an API trigger", async () => {
    const flows = await source().list(alice);
    expect(flows.map((flow) => flow.id)).toEqual(["flow-quote"]);
  });

  test("carries the trigger's description and inputs into the schema", async () => {
    const [flow] = await source().list(alice);
    expect(flow).toMatchObject({
      name: "Price quote",
      description: "Quote a swap",
      inputs: [{ name: "amount", type: "number", description: "How much", required: true }],
      outputs: ["price"],
    });
  });

  test("shows one owner nothing of another's", async () => {
    expect(await source().list(bob)).toHaveLength(1);
    expect((await source().list(bob))[0]?.id).toBe("flow-bob");
  });

  test("runs a flow and answers with the values its return node names", async () => {
    const outcome = await source().invoke(alice, "flow-quote", { amount: 25 });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.result.output).toEqual({ price: "250" });
    expect(outcome.result.runId).toBeTruthy();
  });

  test("refuses input the flow's declaration does not accept", async () => {
    const outcome = await source().invoke(alice, "flow-quote", {});
    expect(outcome).toEqual({
      kind: "invalid_input",
      problems: [{ input: "amount", message: "amount is required." }],
    });
  });

  test("will not run another owner's flow", async () => {
    expect(await source().invoke(bob, "flow-quote", { amount: 1 })).toEqual({ kind: "not_found" });
  });

  test("will not run a flow that is not active", async () => {
    expect(await source().invoke(alice, "flow-draft", {})).toEqual({ kind: "not_found" });
  });
});
