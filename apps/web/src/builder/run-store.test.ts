import type { FlowRun } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createRunStore, selectNodeResult } from "./run-store";

const run: FlowRun = {
  id: "run-1",
  flowId: "flow-1",
  status: "failed",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.000Z",
  trigger: { nodeId: "t" },
  nodes: [
    { nodeId: "t", status: "succeeded", outputs: { run: null } },
    { nodeId: "d", status: "failed", error: "Discord answered 404" },
  ],
  variables: {},
};

describe("run store", () => {
  test("moves through running to the run's status and exposes node results", () => {
    const store = createRunStore();
    expect(store.getState().status).toBe("idle");
    store.getState().start();
    expect(store.getState()).toMatchObject({ status: "running", run: null, error: null });
    store.getState().finish(run);
    expect(store.getState().status).toBe("failed");
    expect(selectNodeResult("d")(store.getState())).toEqual({
      nodeId: "d",
      status: "failed",
      error: "Discord answered 404",
    });
    expect(selectNodeResult("zzz")(store.getState())).toBeUndefined();
  });

  test("a request failure keeps no run and carries the message", () => {
    const store = createRunStore();
    store.getState().start();
    store.getState().fail("unavailable");
    expect(store.getState()).toMatchObject({ status: "failed", run: null, error: "unavailable" });
    store.getState().reset();
    expect(store.getState().status).toBe("idle");
  });

  test("a stored run can seed the store or be loaded later", () => {
    expect(createRunStore(run).getState()).toMatchObject({ status: "failed", run, error: null });
    const store = createRunStore();
    store.getState().fail("unavailable");
    store.getState().loadRun(run);
    expect(store.getState()).toMatchObject({ status: "failed", run, error: null });
  });
});
