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

mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
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
});
