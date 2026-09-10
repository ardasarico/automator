/// <reference types="bun" />
import type {
  AiMessage,
  AiStreamEvent,
  FlowDocument,
  FlowDocumentInput,
} from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StoreApi } from "zustand";
import type { BuilderState } from "../store";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { ReactFlowProvider } = await import("@xyflow/react");
const { AiPanel } = await import("./panel");
const { ChatStoreProvider } = await import("./chat-store-provider");
const { BuilderStoreProvider, useBuilderStore, useBuilderStoreApi } =
  await import("../store-provider");
const { findFlowProblems } = await import("../validation");

const emptyFlow: FlowDocument = {
  version: 1,
  id: "f",
  name: "Ping",
  description: "",
  nodes: [],
  edges: [],
};

/* A trigger and an unconfigured Discord step: the builder reports problems about both. */
const builtFlow: FlowDocument = {
  version: 1,
  id: "f",
  name: "Ping",
  description: "",
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 300, y: 0 },
      label: "Post",
      config: { webhookUrl: "", content: "", username: "" },
    },
  ],
  edges: [],
};

const draft: FlowDocumentInput = {
  version: 1,
  name: "Ping",
  description: "",
  nodes: [{ id: "t1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

const drafting: AiStreamEvent[] = [
  { type: "message", id: "m1" },
  { type: "text.delta", delta: "Adding a trigger" },
  { type: "text.delta", delta: " to start from." },
  { type: "tool.call", id: "c1", name: "add_node", args: { type: "trigger.manual", label: "Run" } },
  { type: "tool.result", id: "c1", ok: true, detail: "Added Run.", document: draft },
  { type: "status", phase: "checking" },
  {
    type: "proposal",
    document: draft,
    verification: {
      checks: [
        { name: "Manual run", status: "skipped", detail: "External service was not called." },
      ],
      warnings: [],
    },
    replaces: true,
  },
  { type: "suggestions", items: ["Post the result to Discord"] },
  { type: "done" },
];

const asking: AiStreamEvent[] = [
  { type: "message", id: "m2" },
  { type: "text.delta", delta: "One thing first." },
  {
    type: "question",
    text: "Which chain should this run on?",
    options: ["Base Sepolia", "World Chain Sepolia"],
  },
  { type: "done" },
];

const patched: AiMessage = {
  id: "m1",
  role: "assistant",
  parts: [],
  createdAt: "2026-09-11T00:00:00.000Z",
};

/* The same turn as `drafting`, stored: a reload must render what the stream rendered. */
const stored: AiMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Start a flow" }],
    createdAt: "2026-09-11T00:00:00.000Z",
  },
  {
    id: "m1",
    role: "assistant",
    parts: [
      { type: "text", text: "Adding a trigger to start from." },
      {
        type: "tool",
        id: "c1",
        name: "add_node",
        args: { type: "trigger.manual", label: "Run" },
        ok: true,
        detail: "Added Run.",
      },
      {
        type: "proposal",
        document: draft,
        verification: {
          checks: [
            { name: "Manual run", status: "skipped", detail: "External service was not called." },
          ],
          warnings: [],
        },
        replaces: true,
        state: "pending",
      },
    ],
    createdAt: "2026-09-11T00:00:01.000Z",
  },
];

type Call = { method: string; url: string; body: unknown };

const calls: Call[] = [];
let script: AiStreamEvent[] = drafting;
let history: AiMessage[] = [];
/* Left open so the panel's waiting state, and the way out of it, can be inspected mid-turn. */
let holdOpen = false;
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;
let builder: StoreApi<BuilderState>;

const posts = () => calls.filter((call) => call.method === "POST");

function sseBody(events: readonly AiStreamEvent[], signal?: AbortSignal | null) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      if (!holdOpen) {
        controller.close();
        return;
      }
      signal?.addEventListener("abort", () =>
        controller.error(new DOMException("Aborted", "AbortError")),
      );
    },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url: String(url),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    if (method === "POST")
      return new Response(sseBody(script, init?.signal), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    if (method === "PATCH") return json({ message: patched });
    if (method === "DELETE") return json({ cleared: true });
    return json({ messages: history });
  }) as unknown as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
  script = drafting;
  history = [];
  holdOpen = false;
  window.sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});

function Probe() {
  const api = useBuilderStoreApi();
  useEffect(() => {
    builder = api;
  }, [api]);
  const nodes = useBuilderStore((state) => state.nodes);
  const preview = useBuilderStore((state) => state.preview);
  return (
    <output data-testid="probe">
      {JSON.stringify({ nodes: nodes.map((node) => node.id), preview: preview !== null })}
    </output>
  );
}

const probe = () => JSON.parse(container.querySelector('[data-testid="probe"]')!.textContent!);

async function mount({ document = emptyFlow, focusOnMount = false } = {}) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BuilderStoreProvider document={document}>
        <ChatStoreProvider focusOnMount={focusOnMount}>
          <ReactFlowProvider>
            <AiPanel />
            <Probe />
          </ReactFlowProvider>
        </ChatStoreProvider>
      </BuilderStoreProvider>,
    );
  });
}

/* Happy DOM may initialize after React disables input events; drive the React props directly. */
function typeInto(textarea: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
    textarea,
    text,
  );
  const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
  const props = (textarea as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  props.onChange({ target: textarea, currentTarget: textarea });
}

const buttons = () => Array.from(container.querySelectorAll("button"));
const buttonNamed = (text: string) =>
  buttons().find((button) => button.textContent?.trim() === text) ??
  buttons().find((button) => button.textContent?.includes(text));
const byLabel = (label: string) =>
  container.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;

async function ask(text: string) {
  const textarea = container.querySelector("textarea")!;
  await act(async () => typeInto(textarea, text));
  await act(async () => (byLabel("Send message") as HTMLButtonElement).click());
}

describe("AiPanel", () => {
  test("shows the empty state and sends a suggestion on click", async () => {
    await mount();
    const chips = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[aria-label="Suggestions"] button'),
    );
    expect(chips).toHaveLength(3);
    const text = chips[0]!.textContent!.trim();
    await act(async () => chips[0]!.click());

    expect(posts()).toHaveLength(1);
    expect((posts()[0]!.body as { text: string }).text).toBe(text);
  });

  test("streams a turn: text renders, a step appears, the canvas previews, and Apply lands it", async () => {
    await mount();
    await ask("Start a flow");

    const log = container.querySelector('[role="log"]')!;
    expect(log.textContent).toContain("Adding a trigger to start from.");
    const list = container.querySelector("ul[id]")!;
    expect(list.textContent).toContain("Add node · Run");
    /* The turn has ended, so its steps are folded into their own summary. */
    expect(list.hasAttribute("hidden")).toBe(true);
    await act(async () => buttonNamed("1 step")!.click());
    expect(container.querySelector("ul[id]")!.hasAttribute("hidden")).toBe(false);
    expect(probe().preview).toBe(true);

    await act(async () => buttonNamed("Apply changes")!.click());
    expect(probe()).toEqual({ nodes: ["t1"], preview: false });
    expect(calls.some((call) => call.method === "PATCH")).toBe(true);
    expect(container.textContent).toContain("Applied");
  });

  test("a question renders as chips and clicking one sends it", async () => {
    script = asking;
    await mount();
    await ask("Watch a balance");

    expect(container.textContent).toContain("Which chain should this run on?");
    script = drafting;
    await act(async () => buttonNamed("Base Sepolia")!.click());
    expect(posts()).toHaveLength(2);
    expect((posts()[1]!.body as { text: string }).text).toBe("Base Sepolia");
  });

  test("Stop aborts the request and records the interruption", async () => {
    script = [];
    holdOpen = true;
    await mount();
    await ask("Draft something slow");

    expect(buttonNamed("Stop")).toBeDefined();
    await act(async () => buttonNamed("Stop")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Stopped before the model answered.",
    );
    expect(buttonNamed("Stop")).toBeUndefined();
  });

  test("the context strip names the selection and Fix problems sends them", async () => {
    await mount({ document: builtFlow });
    await act(async () => {
      builder.getState().onNodesChange([{ type: "select", id: "d", selected: true }]);
    });
    expect(container.textContent).toContain("1 node selected");

    expect(findFlowProblems(builtFlow).length).toBeGreaterThan(0);
    await act(async () => buttonNamed("Fix problems")!.click());
    const body = posts()[0]!.body as { text: string; context: { problems: unknown[] } };
    expect(body.text).toBe("Fix the problems the builder reports.");
    expect(body.context.problems.length).toBeGreaterThan(0);
  });

  test("Discard puts the canvas back and records the decision", async () => {
    await mount();
    await ask("Start a flow");
    expect(probe().preview).toBe(true);

    await act(async () => buttonNamed("Discard")!.click());
    expect(probe()).toEqual({ nodes: [], preview: false });
    expect(container.textContent).toContain("Discarded");
    const patch = calls.find((call) => call.method === "PATCH")!;
    expect(patch.body).toEqual({ state: "discarded" });
  });

  test("a stored conversation renders what the stream rendered", async () => {
    history = stored;
    await mount();

    const log = container.querySelector('[role="log"]')!;
    expect(log.textContent).toContain("Start a flow");
    expect(log.textContent).toContain("Adding a trigger to start from.");
    expect(container.querySelector("ul[id]")!.textContent).toContain("Add node · Run");
    expect(buttonNamed("Apply changes")).toBeDefined();
    expect(posts()).toHaveLength(0);
  });

  test("Enter sends and Shift+Enter leaves the draft alone", async () => {
    await mount();
    const textarea = container.querySelector("textarea")!;
    await act(async () => typeInto(textarea, "A draft still being written"));
    const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
    const props = (textarea as unknown as Record<string, { onKeyDown(event: unknown): void }>)[
      key
    ]!;
    const press = (event: { shiftKey?: boolean; isComposing?: boolean }) =>
      props.onKeyDown({
        key: "Enter",
        shiftKey: event.shiftKey ?? false,
        currentTarget: textarea,
        target: textarea,
        nativeEvent: { isComposing: event.isComposing ?? false },
        preventDefault() {},
      });

    await act(async () => press({ shiftKey: true }));
    expect(posts()).toHaveLength(0);
    await act(async () => press({ isComposing: true }));
    expect(posts()).toHaveLength(0);
    await act(async () => press({}));
    expect(posts()).toHaveLength(1);
    expect((posts()[0]!.body as { text: string }).text).toBe("A draft still being written");
  });

  test("the first message is sent from a pending Home prompt", async () => {
    window.sessionStorage.setItem("automator.pending-prompt", "Post my balance to Discord");
    await mount({ focusOnMount: true });

    expect(posts()).toHaveLength(1);
    expect((posts()[0]!.body as { text: string }).text).toBe("Post my balance to Discord");
    expect(container.textContent).toContain("Post my balance to Discord");
  });
});
