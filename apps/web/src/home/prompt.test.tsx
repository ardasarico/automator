/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* The backdrop pulls in a WebGL vendor bundle that has nothing to do with drafting. */
mock.module("./hero-backdrop", () => ({ HeroBackdrop: () => null }));
/* The action reaches the API through server-only modules; only its call is under test here. */
mock.module("server-only", () => ({}));

const actions = await import("../flows/actions");
const { HomePrompt } = await import("./prompt");

/** Changes the current URL without navigating, so the page can be re-mounted arriving at it. */
function setUrl(url: string) {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

/* Installed per test and taken down again: the export is shared with every other test file. */
let createFlow: ReturnType<typeof spyOn<typeof actions, "createFlowAction">>;

/* No AI fetch runs from Home any more: a call here means the model round trip was not removed. */
let fetchCalls = 0;
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return Response.json({});
  }) as unknown as typeof fetch;
});
beforeEach(() => {
  /* Creating redirects on success, so the action answers with nothing to render. */
  createFlow = spyOn(actions, "createFlowAction").mockResolvedValue(null);
  fetchCalls = 0;
  window.sessionStorage.clear();
  setUrl("http://localhost/");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  createFlow.mockRestore();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});

async function mount() {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<HomePrompt />));
  /* A prompt handed over submits from an effect; give that submission's action its turn. */
  await act(async () => {});
}

async function draft(text: string) {
  await mount();
  const textarea = container.querySelector("textarea")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
    textarea,
    text,
  );
  const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
  const props = (textarea as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  await act(async () => props.onChange({ target: textarea, currentTarget: textarea }));
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
  });
}

describe("HomePrompt", () => {
  test("stores the prompt and creates the flow", async () => {
    await draft("Post my balance to Discord");

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
    expect(fetchCalls).toBe(0);
  });

  test("a create that failed drops the prompt instead of leaving it for the next flow", async () => {
    createFlow.mockResolvedValue({ error: "Automator is unavailable right now." });
    await draft("Post my balance to Discord");

    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBeNull();
  });

  test("focuses the textarea when arriving with ?draft", async () => {
    setUrl("http://localhost/?draft=1");
    await mount();

    expect(window.document.activeElement).toBe(container.querySelector("textarea"));
  });

  test("sends the prompt the landing page put in the URL, and takes it off the URL", async () => {
    setUrl("http://localhost/?prompt=Post%20my%20balance%20to%20Discord");
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
    expect(container.querySelector("textarea")!.value).toBe("Post my balance to Discord");
    // A reload must not send it again.
    expect(window.location.search).toBe("");
  });

  test("sends the prompt the login page kept while the visitor signed in", async () => {
    window.sessionStorage.setItem("automator.handoff-prompt", "Post my balance to Discord");
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.handoff-prompt")).toBeNull();
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
  });

  test("a handed-over prompt whose create failed stays in the box to send again", async () => {
    createFlow.mockResolvedValue({ error: "Automator is unavailable right now." });
    window.sessionStorage.setItem("automator.handoff-prompt", "Post my balance to Discord");
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBeNull();
    expect(container.querySelector("textarea")!.value).toBe("Post my balance to Discord");
  });

  test("cuts a handed-over prompt to what the box accepts", async () => {
    const long = "Post my balance to Discord. ".repeat(200);
    expect(long.length).toBeGreaterThan(4000);
    window.sessionStorage.setItem("automator.handoff-prompt", long);
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    // The box and the canvas carry the same 4,000 characters.
    expect(container.querySelector("textarea")!.value).toBe(long.slice(0, 4000));
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      long.slice(0, 4000).trim(),
    );
  });

  test("sends nothing on its own when nothing was handed over", async () => {
    await mount();
    expect(createFlow).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")!.value).toBe("");
  });
});
