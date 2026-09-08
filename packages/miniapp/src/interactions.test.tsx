import type { FlowDocument, MiniAppSession } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { IdentityActionsProvider } = await import("./identity");
const { RemoteMiniApp } = await import("./remote-mini-app");
const { MiniApp } = await import("./mini-app");
const { ScreenView } = await import("./screens");

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
});

afterAll(async () => {
  container.remove();
  await GlobalRegistrator.unregister();
});

async function mount(view: ReactNode) {
  root = createRoot(container);
  await act(async () => root.render(view));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function session(id: string, type: "screen.page" | "privy.login" = "screen.page"): MiniAppSession {
  return {
    sessionId: id,
    token: `token-${id}`,
    status: "screen",
    steps: [],
    screen: { nodeId: "screen", type, label: id, config: {} },
  };
}

describe("remote session interactions", () => {
  test("Strict Mode opens once and closing the app aborts its pending answer", async () => {
    let starts = 0;
    let answerSignal: AbortSignal | undefined;
    const pending = deferred<MiniAppSession>();
    const client = {
      start: async () => {
        starts += 1;
        return session("First");
      },
      answer: (_id: string, _answer: unknown, signal?: AbortSignal) => {
        answerSignal = signal;
        return pending.promise;
      },
    };
    await mount(
      <StrictMode>
        <RemoteMiniApp client={client} />
      </StrictMode>,
    );
    expect(starts).toBe(1);
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(answerSignal?.aborted).toBe(false);
    await act(async () => root.render(<p>App closed</p>));
    expect(answerSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(session("Late")));
    expect(container.textContent).toBe("App closed");
  });

  test("changing the client removes the old screen until its new session opens", async () => {
    const next = deferred<MiniAppSession>();
    const first = { start: async () => session("First"), answer: async () => session("First") };
    const second = { start: () => next.promise, answer: async () => session("Second") };
    await mount(<RemoteMiniApp client={first} />);
    expect(container.textContent).toContain("First");

    await act(async () => root.render(<RemoteMiniApp client={second} />));
    expect(container.querySelector('[data-session="loading"]')).not.toBeNull();
    expect(container.textContent).not.toContain("First");
    await act(async () => next.resolve(session("Second")));
    expect(container.textContent).toContain("Second");
  });

  test("a late sign-in from the old client cannot answer or replace the new session", async () => {
    const login = deferred<{ privyToken: string }>();
    const next = deferred<MiniAppSession>();
    let answers = 0;
    const first = {
      start: async () => session("First", "privy.login"),
      answer: async () => {
        answers += 1;
        return session("Old answer");
      },
    };
    const second = { start: () => next.promise, answer: async () => session("Second") };
    const actions = { privyLogin: () => login.promise };
    const view = (client: typeof first) => (
      <IdentityActionsProvider actions={actions}>
        <RemoteMiniApp client={client} />
      </IdentityActionsProvider>
    );
    await mount(view(first));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => root.render(view(second)));
    await act(async () => login.resolve({ privyToken: "old-token" }));
    expect(answers).toBe(0);
    await act(async () => next.resolve(session("Second")));
    expect(container.textContent).toContain("Second");
    expect(container.textContent).not.toContain("Old answer");
  });

  test("repeated actions before the loading render send only one answer", async () => {
    const result = deferred<MiniAppSession>();
    const answers: unknown[] = [];
    const client = {
      start: async () => session("First"),
      answer: (id: string, answer: unknown) => {
        answers.push({ id, answer });
        return result.promise;
      },
    };
    await mount(<RemoteMiniApp client={client} />);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(answers).toEqual([
      { id: "First", answer: { token: "token-First", nodeId: "screen", port: "next" } },
    ]);
    await act(async () => result.resolve({ sessionId: "First", status: "end", steps: [] }));
    expect(container.textContent).toContain("All done");
  });
});

describe("identity screen lifecycle", () => {
  test("an unmounted sign-in does not continue its abandoned screen", async () => {
    const login = deferred<{ privyToken: string }>();
    let answers = 0;
    await mount(
      <IdentityActionsProvider actions={{ privyLogin: () => login.promise }}>
        <ScreenView
          node={{
            id: "login",
            type: "privy.login",
            label: "Sign in",
            config: {},
            position: { x: 0, y: 0 },
          }}
          onContinue={() => {
            answers += 1;
          }}
        />
      </IdentityActionsProvider>,
    );
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => root.render(<p>Another screen</p>));
    await act(async () => login.resolve({ privyToken: "old-token" }));
    expect(answers).toBe(0);
  });
});

describe("browser preview lifecycle", () => {
  const document: FlowDocument = {
    version: 1,
    id: "preview",
    name: "Preview",
    description: "",
    nodes: [
      {
        id: "t",
        type: "trigger.miniapp-open",
        label: "Open",
        position: { x: 0, y: 0 },
        config: {},
      },
      { id: "p", type: "screen.page", label: "Continue", position: { x: 0, y: 0 }, config: {} },
      {
        id: "w",
        type: "logic.wait",
        label: "Wait",
        position: { x: 0, y: 0 },
        config: { seconds: 30 },
      },
      {
        id: "d",
        type: "notify.discord",
        label: "Send",
        position: { x: 0, y: 0 },
        config: { webhookUrl: "https://discord.com/api/webhooks/1/test", content: "Preview" },
      },
    ],
    edges: [
      { id: "a", source: "t", sourceHandle: "visitor", target: "p", targetHandle: "data" },
      { id: "b", source: "p", sourceHandle: "next", target: "w", targetHandle: "data" },
      { id: "c", source: "w", sourceHandle: "done", target: "d", targetHandle: "message" },
    ],
  };

  test.each(["start", "answer"] as const)(
    "closing a preview cancels its pending %s before a notification can send",
    async (phase) => {
      const timer = deferred<void>();
      let waiting = 0;
      let sent = 0;
      const flow =
        phase === "answer"
          ? document
          : {
              ...document,
              edges: [
                {
                  id: "a",
                  source: "t",
                  sourceHandle: "visitor",
                  target: "w",
                  targetHandle: "data",
                },
                document.edges[2]!,
              ],
            };
      await mount(
        <StrictMode>
          <MiniApp
            document={flow}
            engine={{
              sleep: async () => {
                waiting += 1;
                await timer.promise;
              },
              fetch: (async () => {
                sent += 1;
                return Response.json({ id: "m" });
              }) as unknown as typeof fetch,
            }}
          />
        </StrictMode>,
      );
      if (phase === "answer")
        await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      expect(waiting).toBeGreaterThan(0);
      await act(async () => root.render(<p>Preview closed</p>));
      await act(async () => timer.resolve());
      expect(sent).toBe(0);
      expect(container.textContent).toBe("Preview closed");
    },
  );

  test("Strict Mode starts only one active preview and a double action sends once", async () => {
    const timer = deferred<void>();
    let sent = 0;
    await mount(
      <StrictMode>
        <MiniApp
          document={document}
          engine={{
            sleep: () => timer.promise,
            fetch: (async () => {
              sent += 1;
              return Response.json({ id: "m" });
            }) as unknown as typeof fetch,
          }}
        />
      </StrictMode>,
    );
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      button.click();
      button.click();
    });
    await act(async () => timer.resolve());
    expect(sent).toBe(1);
    expect(container.textContent).toContain("All done");
  });
});

test("legacy form field names remain own values instead of disappearing into the object prototype", async () => {
  let submitted: Record<string, string> | undefined;
  await mount(
    <ScreenView
      node={{
        id: "form",
        type: "screen.form",
        label: "Details",
        position: { x: 0, y: 0 },
        config: { fields: [{ id: "__proto__", type: "text", label: "Legacy field" }] },
      }}
      onContinue={(_port, data) => {
        submitted = data;
      }}
    />,
  );
  container.querySelector<HTMLInputElement>("input")!.value = "retained";
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(Object.hasOwn(submitted!, "__proto__")).toBe(true);
  expect(submitted!["__proto__"]).toBe("retained");
});
