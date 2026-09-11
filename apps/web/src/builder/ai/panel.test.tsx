/// <reference types="bun" />
import type {
  AiMessage,
  AiStreamEvent,
  FlowDocument,
  FlowDocumentInput,
} from "@automator/contracts";
import { aiStoppedDetail } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, StrictMode, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StoreApi } from "zustand";
import type { BuilderState } from "../store";
import type { ChatState } from "./chat-store";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { ReactFlowProvider } = await import("@xyflow/react");
const { AiPanel } = await import("./panel");
const { ChatStoreProvider, useChatStoreApi } = await import("./chat-store-provider");
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
      config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi", username: "" },
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

const spoken: AiStreamEvent[] = [
  { type: "message", id: "m3" },
  { type: "tool.call", id: "s1", name: "suggest_next", args: { items: ["Add a step"] } },
  { type: "tool.result", id: "s1", ok: true, detail: "Suggested." },
  { type: "tool.call", id: "s2", name: "ask_user", args: { text: "Which chain?" } },
  {
    type: "tool.result",
    id: "s2",
    ok: false,
    detail: "A question was already asked this turn.",
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

/* The same two nodes the canvas holds, with one label changed: an edit, not a replacement. */
const editDraft: FlowDocumentInput = {
  version: 1,
  name: "Ping",
  description: "",
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 300, y: 0 },
      label: "Post",
      config: { webhookUrl: "", content: "hello", username: "" },
    },
  ],
  edges: [],
};

const editing: AiStreamEvent[] = [
  { type: "message", id: "m4" },
  {
    type: "proposal",
    document: editDraft,
    verification: { checks: [], warnings: [] },
    replaces: false,
  },
  { type: "done" },
];

/* A turn that was stopped, as it comes back from the API on the next page load. */
const stoppedTurn: AiMessage[] = [
  {
    id: "u2",
    role: "user",
    parts: [{ type: "text", text: "Draft something slow" }],
    createdAt: "2026-09-11T00:00:00.000Z",
  },
  {
    id: "m5",
    role: "assistant",
    parts: [{ type: "error", error: "unavailable", detail: aiStoppedDetail }],
    createdAt: "2026-09-11T00:00:01.000Z",
  },
];

/* Two calls the model gave the same id: its ids are its own, and a repeat must still draw twice. */
const repeatedIds: AiMessage[] = [
  {
    id: "m7",
    role: "assistant",
    parts: [
      { type: "tool", id: "c1", name: "add_node", args: { label: "Run" }, ok: true, detail: "" },
      { type: "tool", id: "c1", name: "add_node", args: { label: "Post" }, ok: true, detail: "" },
    ],
    createdAt: "2026-09-11T00:00:01.000Z",
  },
];

/* Suggestions called before the proposal, which is where the agent often puts them. */
const suggestionsFirst: AiMessage[] = [
  {
    id: "m6",
    role: "assistant",
    parts: [
      { type: "suggestions", items: ["Post the result to Discord"] },
      {
        type: "proposal",
        document: draft,
        verification: { checks: [], warnings: [] },
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
/* A failure the POST answers with instead of a stream, for the pre-stream error paths. */
let postFailure: { status: number; body: unknown } | null = null;
/* Counted down, so a retry can succeed where the first listing failed. */
let listFailures = 0;
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;
let builder: StoreApi<BuilderState>;
let chat: StoreApi<ChatState>;

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
    if (method === "POST" && postFailure) return json(postFailure.body, postFailure.status);
    if (method === "POST")
      return new Response(sseBody(script, init?.signal), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    if (method === "PATCH") return json({ message: patched });
    if (method === "DELETE") return json({ cleared: true });
    if (listFailures > 0) {
      listFailures -= 1;
      return json({ error: "unavailable" }, 503);
    }
    return json({ messages: history });
  }) as unknown as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
  script = drafting;
  history = [];
  holdOpen = false;
  postFailure = null;
  listFailures = 0;
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
  const chatApi = useChatStoreApi();
  useEffect(() => {
    builder = api;
    chat = chatApi;
  }, [api, chatApi]);
  const nodes = useBuilderStore((state) => state.nodes);
  const preview = useBuilderStore((state) => state.preview);
  return (
    <output data-testid="probe">
      {JSON.stringify({ nodes: nodes.map((node) => node.id), preview: preview !== null })}
    </output>
  );
}

const probe = () => JSON.parse(container.querySelector('[data-testid="probe"]')!.textContent!);

async function mount({ document = emptyFlow, focusOnMount = false, strict = false } = {}) {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  const tree = (
    <BuilderStoreProvider document={document}>
      <ChatStoreProvider focusOnMount={focusOnMount}>
        <ReactFlowProvider>
          <AiPanel />
          <Probe />
        </ReactFlowProvider>
      </ChatStoreProvider>
    </BuilderStoreProvider>
  );
  const wrap = (children: ReactNode) => (strict ? <StrictMode>{children}</StrictMode> : children);
  await act(async () => {
    root.render(wrap(tree));
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

  test("the stored conversation loads under Strict Mode", async () => {
    history = stored;
    await mount({ strict: true });

    const log = container.querySelector('[role="log"]')!;
    expect(log.textContent).toContain("Adding a trigger to start from.");
    expect(buttonNamed("Apply changes")).toBeDefined();
  });

  test("a conversation that failed to load comes back on Try again", async () => {
    listFailures = 1;
    history = stored;
    await mount();

    expect(container.textContent).toContain("AI could not complete this request right now.");
    await act(async () => buttonNamed("Try again")!.click());
    expect(container.querySelector('[role="log"]')!.textContent).toContain(
      "Adding a trigger to start from.",
    );
  });

  test("a tool that speaks for itself is listed only when it was refused", async () => {
    script = spoken;
    await mount();
    await ask("Watch a balance");

    const list = container.querySelector("ul[id]")!;
    expect(list.textContent).toContain("Ask the user");
    expect(list.textContent).toContain("A question was already asked this turn.");
    expect(container.textContent).not.toContain("Suggest next steps");
  });

  test("a failure names the code's recovery step and the API's own detail", async () => {
    postFailure = {
      status: 401,
      body: { error: "unauthorized", detail: "The session token was rejected." },
    };
    await mount();
    await ask("Start a flow");

    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Your session expired.");
    expect(alert.textContent).toContain("The session token was rejected.");
  });

  test("an edit sends the canvas with secrets blanked and a new flow sends none", async () => {
    await mount({ document: builtFlow });
    await ask("Change the message");

    const edit = posts()[0]!.body as {
      document?: { nodes: { config: Record<string, unknown> }[] };
    };
    expect(edit.document?.nodes[1]?.config.webhookUrl).toBe("");
    expect(JSON.stringify(edit)).not.toContain("discord.com/api/webhooks");

    await act(async () => chat.getState().setMode("new"));
    await ask("Start again from scratch");
    const started = posts()[1]!.body as { replace?: boolean };
    expect(started).not.toHaveProperty("document");
    /* Without this the API would fall back to the saved flow and edit that instead. */
    expect(started.replace).toBe(true);
    expect((posts()[0]!.body as { replace?: boolean }).replace).toBeUndefined();
  });

  test("applying an edit keeps the canvas's group frames", async () => {
    script = editing;
    await mount({ document: builtFlow });
    let frame: string | null = null;
    await act(async () => {
      frame = builder.getState().groupNodes(["t", "d"]);
    });
    expect(frame).not.toBeNull();
    await ask("Say hello instead");

    /* The draft the model sent has no frames; the preview and the canvas both get them back. */
    const preview = builder.getState().preview!;
    expect(preview.document.groups?.map((group) => group.id)).toEqual([frame!]);
    expect(preview.nodes.find((node) => node.id === "d")!.parentId).toBe(frame!);

    await act(async () => buttonNamed("Apply changes")!.click());
    expect(probe().nodes).toContain(frame!);
    expect(builder.getState().nodes.find((node) => node.id === "d")!.parentId).toBe(frame!);
  });

  test("two calls sharing one id are two rows, keyed by where they sit", async () => {
    history = repeatedIds;
    const complaints: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => complaints.push(args);
    try {
      await mount();
    } finally {
      console.error = original;
    }

    expect(container.querySelectorAll("ul[id] li")).toHaveLength(2);
    expect(JSON.stringify(complaints)).not.toContain("same key");
  });

  test("a stopped turn reads the same after a reload as it did live", async () => {
    history = stoppedTurn;
    await mount();

    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe(aiStoppedDetail);
    expect(alert.textContent).not.toContain("AI could not complete");
  });

  test("suggestions are shown under the turn wherever the agent offered them", async () => {
    history = suggestionsFirst;
    await mount();

    const text = container.querySelector('[role="log"]')!.textContent!;
    expect(text).toContain("Post the result to Discord");
    expect(text.indexOf("Post the result to Discord")).toBeGreaterThan(
      text.indexOf("Apply changes"),
    );
  });

  test("the first message is sent from a pending Home prompt", async () => {
    window.sessionStorage.setItem("automator.pending-prompt", "Post my balance to Discord");
    await mount({ focusOnMount: true });

    expect(posts()).toHaveLength(1);
    expect((posts()[0]!.body as { text: string }).text).toBe("Post my balance to Discord");
    expect(container.textContent).toContain("Post my balance to Discord");
  });
});
