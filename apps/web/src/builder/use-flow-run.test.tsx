/// <reference types="bun" />
import type { FlowDocument, FlowRun, FlowRunRecord } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RunState } from "./run-store";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let tokenRequest = () => Promise.resolve<string | null>("privy-token");
const getAccessToken = () => tokenRequest();
mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => getAccessToken,
}));

const { useFlowRun, useSimulationTriggers } = await import("./use-flow-run");
const { FlowActivationProvider, useFlowActivation } = await import("./flow-activation");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");
const { RunStoreProvider, useRunStore } = await import("./run-store-provider");

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Two triggers",
  description: "",
  nodes: [
    {
      id: "first",
      type: "trigger.webhook",
      position: { x: 0, y: 0 },
      label: "First",
      config: { samplePayload: '{"source":"first"}' },
    },
    {
      id: "second",
      type: "trigger.manual",
      position: { x: 0, y: 200 },
      label: "Second",
      config: { samplePayload: '{"source":"second"}' },
    },
    { id: "hold", type: "logic.wait", position: { x: 300, y: 0 }, label: "Hold", config: {} },
  ],
  edges: [],
};
const run: FlowRun = {
  id: "run-1",
  flowId: document.id,
  status: "succeeded",
  startedAt: "2026-09-08T10:00:00.000Z",
  finishedAt: "2026-09-08T10:00:01.000Z",
  trigger: { nodeId: "first" },
  nodes: [{ nodeId: "first", status: "succeeded", outputs: { request: {} } }],
  variables: {},
};
const record: FlowRunRecord = {
  run,
  document: { ...document, name: "Executed snapshot" },
  flowName: document.name,
  source: "manual",
};

let controller: ReturnType<typeof useFlowRun>;
let simulation: ReturnType<typeof useSimulationTriggers>;
let state: RunState;
let setName: (name: string) => void;
let setLiveMode: (live: boolean) => void;
let selectNode: (id: string | null) => void;
function Probe() {
  const runController = useFlowRun();
  const triggers = useSimulationTriggers();
  const runState = useRunStore((value) => value);
  const setMeta = useBuilderStore((value) => value.setMeta);
  const nodes = useBuilderStore((value) => value.nodes);
  const onNodesChange = useBuilderStore((value) => value.onNodesChange);
  const activation = useFlowActivation();
  useEffect(() => {
    controller = runController;
    simulation = triggers;
    state = runState;
    setName = (name) => setMeta({ name });
    setLiveMode = activation.setLiveMode;
    selectNode = (id) =>
      onNodesChange(
        nodes.map((node) => ({ type: "select", id: node.id, selected: node.id === id })),
      );
  });
  return <output>{runState.status}</output>;
}

type Request = {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  resolve(response: Response): void;
};
const requests: Request[] = [];
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  tokenRequest = () => Promise.resolve("privy-token");
  requests.length = 0;
  globalThis.fetch = ((url, init) =>
    new Promise<Response>((resolve) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        signal: init!.signal!,
        resolve,
      });
    })) as typeof fetch;
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <BuilderStoreProvider document={document}>
        <FlowActivationProvider enabled={false} webhookToken={null}>
          <RunStoreProvider>
            <Probe />
          </RunStoreProvider>
        </FlowActivationProvider>
      </BuilderStoreProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});
afterAll(async () => GlobalRegistrator.unregister());

describe("useFlowRun", () => {
  test("saved runs select the sampled trigger explicitly and retain the server snapshot", async () => {
    let pending: Promise<void>;
    await act(async () => {
      pending = controller.run();
    });
    expect(requests[0]!.url).toBe("/api/flows/flow-1/runs");
    expect(requests[0]!.body).toEqual({
      trigger: { nodeId: "first", payload: { source: "first" } },
      screens: "auto",
      mode: "dry-run",
    });
    await act(async () => {
      requests[0]!.resolve(Response.json(record, { status: 201 }));
      await pending;
    });
    expect(state.run).toEqual(run);
    expect(state.document?.name).toBe("Executed snapshot");
  });

  test("every starting trigger is offered, and the selected one starts the run", async () => {
    expect(simulation.triggers.map((trigger) => trigger.id)).toEqual(["first", "second"]);
    expect(simulation.activeId).toBe("first");

    await act(async () => selectNode("second"));
    expect(simulation.activeId).toBe("second");
    await act(async () => {
      void controller.run();
    });
    expect(requests[0]!.body).toEqual({
      trigger: { nodeId: "second", payload: { source: "second" } },
      screens: "auto",
      mode: "dry-run",
    });

    // Naming a trigger outright beats the selection, and selecting something else clears it.
    await act(async () => {
      void controller.run("first");
    });
    expect(requests[1]!.body).toMatchObject({
      trigger: { nodeId: "first", payload: { source: "first" } },
    });
    await act(async () => selectNode(null));
    expect(simulation.activeId).toBe("first");
  });

  test("a selected node that cannot start a run leaves the header and the run on the same trigger", async () => {
    // The normal state while editing: something selected on the canvas that is not a trigger.
    await act(async () => selectNode("hold"));
    expect(simulation.activeId).toBe("first");
    await act(async () => {
      void controller.run();
    });
    expect(requests[0]!.body).toMatchObject({
      trigger: { nodeId: "first", payload: { source: "first" } },
    });

    // The header hands the run what it displays, so the two agree by construction, not by luck.
    await act(async () => {
      void controller.run(simulation.activeId ?? undefined);
    });
    const sent = requests[1]!.body.trigger as { nodeId: string | null };
    expect(sent.nodeId).toBe(simulation.activeId);
  });

  test("unsaved live runs send and retain the canvas snapshot from the start", async () => {
    await act(async () => {
      setName("Unsaved");
      setLiveMode(true);
    });
    let pending: Promise<void>;
    await act(async () => {
      pending = controller.run();
    });
    expect(requests[0]!.url).toBe("/api/flows/run");
    expect(requests[0]!.body.mode).toBe("live");
    expect(requests[0]!.body.document).toMatchObject({ name: "Unsaved" });
    await act(async () => setName("Edited during execution"));
    await act(async () => {
      requests[0]!.resolve(Response.json(run));
      await pending;
    });
    expect(state.document?.name).toBe("Unsaved");
  });

  test("stop during authentication prevents a run request after the token arrives", async () => {
    let resolveToken!: (token: string) => void;
    tokenRequest = () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      });
    let pending: Promise<void>;
    await act(async () => {
      pending = controller.run();
    });
    await act(async () => controller.stop());
    await act(async () => {
      resolveToken("privy-token");
      await pending;
    });
    expect(requests).toHaveLength(0);
    expect(state.status).toBe("idle");
  });

  test("restart aborts the old request and ignores a late result", async () => {
    let first: Promise<void>;
    let second: Promise<void>;
    await act(async () => {
      first = controller.run();
    });
    await act(async () => {
      second = controller.run();
    });
    expect(requests[0]!.signal.aborted).toBe(true);
    await act(async () => {
      requests[0]!.resolve(Response.json(record, { status: 201 }));
      await first;
    });
    expect(state.status).toBe("running");
    await act(async () => {
      requests[1]!.resolve(
        Response.json({ ...record, run: { ...run, id: "run-2" } }, { status: 201 }),
      );
      await second;
    });
    expect(state.run?.id).toBe("run-2");
  });

  test("unmount during authentication prevents a later run request", async () => {
    let resolveToken!: (token: string) => void;
    tokenRequest = () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      });
    let pending: Promise<void>;
    await act(async () => {
      pending = controller.run();
    });
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => {
      resolveToken("privy-token");
      await pending;
    });
    expect(requests).toHaveLength(0);
  });

  test("API failures expose a recoverable message and leave no stale result", async () => {
    let pending: Promise<void>;
    await act(async () => {
      pending = controller.run();
    });
    await act(async () => {
      requests[0]!.resolve(Response.json({ error: "unauthorized" }, { status: 401 }));
      await pending;
    });
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Your session expired. Reload the page and try again.");
    expect(state.run).toBeNull();
  });
});
