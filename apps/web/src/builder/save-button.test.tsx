/// <reference types="bun" />
import type { FlowDocument } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import type { SaveFlowController } from "./save-button";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

/** Each save waits on a gate the test opens, so two saves can overlap. */
let gates: Array<{ resolve(): void; reject(error: Error): void }> = [];
class FlowRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
mock.module("../flows/client", () => ({
  FlowRequestError,
  saveFlowRequest: () =>
    new Promise<void>((resolve, reject) => {
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

/** The controller and the store action the test drives, published from an effect. */
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

beforeEach(() => {
  gates = [];
});
afterAll(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  await GlobalRegistrator.unregister();
});

describe("useSaveFlow", () => {
  test("a save asked for while one is running shares that save's outcome", async () => {
    await mount();
    await act(async () => handles.setMeta!({ name: "Renamed" }));
    let first: Promise<{ ok: boolean }>;
    let second: Promise<{ ok: boolean }>;
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
    await act(async () => handles.setMeta!({ name: "Renamed twice" }));
    let outcome: Promise<{ ok: boolean }>;
    await act(async () => {
      outcome = handles.controller!.save();
    });
    expect(gates).toHaveLength(1);
    await act(async () => gates[0]!.resolve());
    expect(await outcome!).toEqual({ ok: true });
    expect(container.textContent).toBe("saved");
  });
});
