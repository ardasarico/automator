import { describe, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import { executeStoredRun, RunPersistenceError } from "./execute";
import { memoryStores } from "./test-stores";

const flow: FlowDocument = {
  id: "flow-1",
  version: 1,
  name: "Triggered action",
  description: "",
  nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

describe("executeStoredRun", () => {
  test("a history failure retains the finished result and never reruns its effects", async () => {
    const stores = memoryStores([{ ownerId: "alice", flow }]);
    const record = (await stores.flows.find("alice", flow.id))!;
    const cause = new Error("Database unavailable");
    stores.runs.create = async () => {
      throw cause;
    };
    let executions = 0;
    let failure: unknown;
    try {
      await executeStoredRun(stores, {
        ownerId: "alice",
        record,
        source: "event",
        engine: {
          executors: {
            "trigger.manual": {
              kind: "trigger",
              run: async () => {
                executions += 1;
                return { run: { accepted: true } };
              },
            },
          },
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(RunPersistenceError);
    if (!(failure instanceof RunPersistenceError)) throw failure;
    expect(failure.cause).toBe(cause);
    expect(failure.record).toMatchObject({
      document: flow,
      source: "event",
      flowName: flow.name,
      run: {
        status: "succeeded",
        trigger: { nodeId: "t" },
        nodes: [{ nodeId: "t", status: "succeeded", outputs: { run: { accepted: true } } }],
      },
    });
    expect(executions).toBe(1);
  });
});

test("claimed execution retains its evidence when history persistence fails", async () => {
  const stores = memoryStores([{ ownerId: "alice", flow, enabled: true }]);
  const record = (await stores.flows.find("alice", flow.id))!;
  const admission = await stores.triggerClaims.claim({
    flowId: flow.id,
    nodeId: "t",
    pollingRevision: "0",
    source: "event",
    occurrenceKey: "log-1",
    at: new Date(),
  });
  if (admission.kind !== "claimed") throw new Error("Expected claim");
  stores.runs.create = async () => {
    throw new Error("History unavailable");
  };
  await expect(
    executeStoredRun(stores, {
      ownerId: "alice",
      record,
      source: "event",
      claim: { id: admission.id, store: stores.triggerClaims },
    }),
  ).rejects.toBeInstanceOf(RunPersistenceError);
  const saved = stores.claims.get(admission.id)!;
  expect(saved.status).toBe("completed");
  expect(saved.historySaved).toBe(false);
  expect(saved.record?.run.id).toBe(admission.id);
  expect(saved.record?.run.status).toBe("succeeded");
  expect((await stores.triggerClaims.claim({ ...saved, at: new Date() })).kind).toBe("duplicate");
});

test("a lost completion write leaves durable admission unresolved", async () => {
  const stores = memoryStores([{ ownerId: "alice", flow, enabled: true }]);
  const record = (await stores.flows.find("alice", flow.id))!;
  const input = {
    flowId: flow.id,
    nodeId: "t",
    pollingRevision: "0",
    source: "event" as const,
    occurrenceKey: "log-1",
    at: new Date(),
  };
  const admission = await stores.triggerClaims.claim(input);
  if (admission.kind !== "claimed") throw new Error("Expected claim");
  stores.triggerClaims.complete = async () => {
    throw new Error("Claim store unavailable");
  };
  await expect(
    executeStoredRun(stores, {
      ownerId: "alice",
      record,
      source: "event",
      claim: { id: admission.id, store: stores.triggerClaims },
    }),
  ).rejects.toBeInstanceOf(RunPersistenceError);
  expect(stores.runRecords).toHaveLength(1);
  expect(stores.claims.get(admission.id)?.status).toBe("running");
  expect(await stores.triggerClaims.claim({ ...input, occurrenceKey: "log-2" })).toEqual({
    kind: "blocked",
  });
});
