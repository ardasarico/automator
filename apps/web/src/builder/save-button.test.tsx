/// <reference types="bun" />
import type { FlowDocument, FlowProblem } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import type { SaveFlowController, SaveOutcome } from "./save-button";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

let gates: Array<{ resolve(): void; reject(error: Error): void }> = [];
let savedNames: string[] = [];
/* Mirrors the real class, `problems` included, since later suites catch this one too. */
class FlowRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly problems: readonly FlowProblem[] = [],
  ) {
    super(code);
  }
}
/* mock.module writes to Bun's process-global registry, so a partial mock breaks every later suite
 * that imports the real module. Keep the untouched exports by spreading them back in. */
const flowsClient = await import("../flows/client");
mock.module("../flows/client", () => ({
  ...flowsClient,
  FlowRequestError,
  saveFlowRequest: (_id: string, _token: string, input: { name: string }) =>
    new Promise<void>((resolve, reject) => {
      savedNames.push(input.name);
      gates.push({ resolve, reject });
    }),
}));

const { createRoot } = await import("react-dom/client");
const { SaveFlowProvider, useSaveFlowController } = await import("./save-button");
const { BuilderStoreProvider, useBuilderStore } = await import("./store-provider");

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Ping",
  description: "",
  nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

const handles: { controller?: SaveFlowController; setMeta?: (patch: { name: string }) => void } =
  {};
function Probe() {
  const controller = useSaveFlowController();
  const setMeta = useBuilderStore((state) => state.setMeta);
  useEffect(() => {
    handles.controller = controller;
    handles.setMeta = setMeta;
  });
  return <output data-testid="probe">{controller.state}</output>;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <SaveFlowProvider>
          <Probe />
        </SaveFlowProvider>
      </BuilderStoreProvider>,
    );
  });
}

beforeEach(async () => {
  gates = [];
  savedNames = [];
  await mount();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("useSaveFlow", () => {
  test("a save asked for while one is running shares that save's outcome", async () => {
    await act(async () => handles.setMeta!({ name: "Renamed" }));
    let first: Promise<SaveOutcome>;
    let second: Promise<SaveOutcome>;
    await act(async () => {
      first = handles.controller!.save();
      second = handles.controller!.save();
    });
    expect(gates).toHaveLength(1);
    await act(async () => gates[0]!.reject(new FlowRequestError("unauthorized")));
    const outcome = { ok: false, message: "Your session expired. Reload the page and try again." };
    expect(await first!).toEqual(outcome);
    expect(await second!).toEqual(outcome);
    expect(container.textContent).toBe("failed");
  });

  test("a save after the running one finished starts a new request", async () => {
    await act(async () => handles.setMeta!({ name: "First saved edit" }));
    let first: Promise<SaveOutcome>;
    await act(async () => {
      first = handles.controller!.save();
    });
    await act(async () => gates[0]!.resolve());
    expect(await first!).toEqual({ ok: true });

    await act(async () => handles.setMeta!({ name: "Renamed twice" }));
    let outcome: Promise<SaveOutcome>;
    await act(async () => {
      outcome = handles.controller!.save();
    });
    expect(gates).toHaveLength(2);
    await act(async () => gates[1]!.resolve());
    expect(await outcome!).toEqual({ ok: true });
    expect(container.textContent).toBe("saved");
  });

  test("edits made during a save remain dirty and prevent Save and leave from navigating", async () => {
    await act(async () => handles.setMeta!({ name: "Sent to the server" }));
    let outcome: Promise<SaveOutcome>;
    await act(async () => {
      outcome = handles.controller!.save();
    });
    await act(async () => handles.setMeta!({ name: "Edited while saving" }));
    await act(async () => gates[0]!.resolve());

    expect(await outcome!).toEqual({
      ok: false,
      message: "The flow changed while saving. Save again to keep the latest changes.",
    });
    expect(handles.controller!.dirty).toBe(true);
    expect(handles.controller!.canSave).toBe(true);

    await act(async () => {
      outcome = handles.controller!.save();
    });
    expect(gates).toHaveLength(2);
    await act(async () => gates[1]!.resolve());
    expect(await outcome!).toEqual({ ok: true });
    expect(handles.controller!.dirty).toBe(false);
  });

  test("save reads edits made before React has rendered the updated store", async () => {
    let outcome: Promise<SaveOutcome>;
    await act(async () => {
      handles.setMeta!({ name: "Latest edit" });
      outcome = handles.controller!.save();
    });
    expect(savedNames).toEqual(["Latest edit"]);
    await act(async () => gates[0]!.resolve());
    expect(await outcome!).toEqual({ ok: true });
    expect(handles.controller!.dirty).toBe(false);
  });
});
