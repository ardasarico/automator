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
import { privyModule } from "../auth/test-privy";

/* A real origin: the handoff test rewrites the address, which about:blank refuses. */
GlobalRegistrator.register({ url: "http://localhost/" });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* Mocked at the SDK, not at `useAccessToken`: the session provider reads the same module, and a
 * module mock outlives this file, so its tests would get this token instead of Privy's. */
mock.module("@privy-io/react-auth", () =>
  privyModule({ usePrivy: () => ({ getAccessToken: async () => "privy-token" }) }),
);
/* The backdrop pulls in a WebGL vendor bundle that has nothing to do with drafting. */
mock.module("./hero-backdrop", () => ({ HeroBackdrop: () => null }));
/* The action reaches the API through server-only modules; only its call is under test here. */
mock.module("server-only", () => ({}));

const actions = await import("../flows/actions");
const { HomePrompt } = await import("./prompt");

/* Installed per test and taken down again: the export is shared with every other test file. */
let createFlow: ReturnType<typeof spyOn<typeof actions, "createFlowAction">>;

const answer = {
  kind: "flow",
  summary: "Posts the balance to Discord.",
  document: {
    version: 1,
    name: "Balance",
    description: "",
    nodes: [
      { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    ],
    edges: [],
  },
};

let response: unknown = answer;
let status = 200;
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.fetch = (async () => Response.json(response, { status })) as unknown as typeof fetch;
});
beforeEach(() => {
  /* Creating redirects on success, so the action answers with nothing to render. */
  createFlow = spyOn(actions, "createFlowAction").mockResolvedValue(null);
  response = answer;
  status = 200;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
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
  /* A prompt handed over submits from an effect; give that submission's request its turn. */
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
  test("hands the answer to the canvas and only then creates the flow", async () => {
    await draft("Post my balance to Discord");

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
    expect(JSON.parse(window.sessionStorage.getItem("automator.ai-draft-answer")!)).toEqual(answer);
  });

  test("a failed draft creates no flow and says why", async () => {
    status = 422;
    response = { error: "invalid_flow", detail: "Balance check: unknown output result on n3." };
    await draft("Post my balance to Discord");

    expect(createFlow).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("automator.ai-draft-answer")).toBeNull();
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("unknown output result on n3");
    // The prompt stays in the box, so rephrasing does not mean retyping.
    expect(container.querySelector("textarea")!.value).toBe("Post my balance to Discord");
  });

  test("drafts the prompt the landing page put in the URL, and takes it off the URL", async () => {
    window.history.replaceState(null, "", "/?prompt=Post%20my%20balance%20to%20Discord");
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
    expect(container.querySelector("textarea")!.value).toBe("Post my balance to Discord");
    // A reload must not draft it again.
    expect(window.location.search).toBe("");
  });

  test("drafts the prompt the login page kept while the visitor signed in", async () => {
    window.sessionStorage.setItem("automator.handoff-prompt", "Post my balance to Discord");
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    expect(window.sessionStorage.getItem("automator.handoff-prompt")).toBeNull();
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      "Post my balance to Discord",
    );
  });

  test("a handed-over prompt that fails to draft stays in the box with the reason", async () => {
    status = 422;
    response = { error: "invalid_flow", detail: "Balance check: unknown output result on n3." };
    window.sessionStorage.setItem("automator.handoff-prompt", "Post my balance to Discord");
    await mount();

    expect(createFlow).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("result on n3");
    expect(container.querySelector("textarea")!.value).toBe("Post my balance to Discord");
  });

  test("cuts a handed-over prompt to what the box accepts", async () => {
    const long = "Post my balance to Discord. ".repeat(200);
    expect(long.length).toBeGreaterThan(4000);
    window.sessionStorage.setItem("automator.handoff-prompt", long);
    await mount();

    expect(createFlow.mock.calls).toEqual([[{ ai: true }]]);
    // The box and the request carry the same 4,000 characters.
    expect(container.querySelector("textarea")!.value).toBe(long.slice(0, 4000));
    expect(window.sessionStorage.getItem("automator.pending-prompt")).toBe(
      long.slice(0, 4000).trim(),
    );
  });

  test("drafts nothing on its own when nothing was handed over", async () => {
    await mount();
    expect(createFlow).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")!.value).toBe("");
  });
});
