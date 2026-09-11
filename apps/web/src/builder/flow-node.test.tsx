/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

/* Each scenario runs in its own process: the card's hook mocks must not leak into the other
 * builder suites through Bun's shared module registry. */
async function run(script: string) {
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

const preamble = `
  import assert from "node:assert/strict";
  import { GlobalRegistrator } from "@happy-dom/global-registrator";
  import { mock } from "bun:test";
  import { act, createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";

  GlobalRegistrator.register();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  let result = undefined;
  let problems = [];
  const renamed = [];
  mock.module("@xyflow/react", () => ({
    Position: { Left: "left", Right: "right" },
    NodeResizer: () => null,
    Handle: ({ type, position, id, ...rest }) =>
      createElement("span", { "data-handle": type, "data-port": id, "aria-label": rest["aria-label"] }),
  }));
  mock.module("../data/tables-context", () => ({ useDataTables: () => ({ tables: [] }) }));
  mock.module("./run-store-provider", () => ({ useRunStore: (select) => select({ run: null }) }));
  mock.module("./run-store", () => ({ selectNodeResult: () => () => result }));
  mock.module("./use-flow-problems", () => ({ useNodeProblems: () => problems }));
  // A tiny store: the card reads "renaming" and the label toggles it, so the mock has to notify.
  const listeners = new Set();
  const state = {
    renaming: null,
    renameNode: (id, label) => renamed.push([id, label]),
    setRenaming: (id) => {
      state.renaming = id;
      listeners.forEach((listener) => listener());
    },
  };
  const { useSyncExternalStore } = await import("react");
  mock.module("./store-provider", () => ({
    useBuilderStoreIfAny: (select) =>
      useSyncExternalStore(
        (listener) => (listeners.add(listener), () => listeners.delete(listener)),
        () => select(state),
        () => select(state),
      ),
  }));
  const { FlowNode } = await import("./flow-node");
  const card = (type, label, config = {}) =>
    createElement(FlowNode, { id: "n1", selected: false, data: { type, label, config } });
  const draw = (type, label, config) => renderToStaticMarkup(card(type, label, config));
`;

test("a condition is a branch: its comparison in the middle, an answer tab per output", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const html = draw("logic.condition", "Amount over 10?", {
      left: "{{input.amount}}", operator: "greater_or_equal", right: "10",
    });
    assert.match(html, /input\\.amount ≥ 10/);
    assert.match(html, /data-family="branch"/);
    assert.match(html, /data-port="value"/);
    assert.match(html, /data-tone="yes">True<span data-handle="source" data-port="true"/);
    assert.match(html, /data-tone="no">False<span data-handle="source" data-port="false"/);
    assert.doesNotMatch(html, /nodePortRow/);
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a one-in one-out node puts its dots on the summary row and skips the port list", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const html = draw("notify.discord", "Announce", { content: "Paid" });
    assert.match(html, /Paid/);
    assert.match(html, /data-handle="target" data-port="message" aria-label="Message"/);
    assert.match(html, /data-handle="source" data-port="sent" aria-label="Sent"/);
    assert.doesNotMatch(html, /nodePortRow/);
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a trigger wears its tag and tint, with nothing coming in", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const html = draw("trigger.miniapp-open", "Mini-app opened");
    assert.match(html, /data-family="trigger"/);
    assert.match(html, />Trigger</);
    assert.match(html, /when someone opens the app/);
    assert.match(html, /data-handle="source" data-port="visitor"/);
    assert.doesNotMatch(html, /data-handle="target"/);
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a screen lists what the visitor gets and keeps its port rows", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const html = draw("screen.form", "Sign up", {
      fields: [{ id: "email", label: "Email" }], submit: "Continue",
    });
    assert.match(html, /data-family="screen"/);
    assert.match(html, /Email field/);
    assert.match(html, /Continue button/);
    assert.match(html, /data-port="data"/);
    assert.match(html, /data-port="submitted"/);
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a node with nothing to state shows its catalog description", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const { getCatalogEntry } = await import("./catalog");
    const html = draw("privy.login", "Log in");
    assert.ok(html.includes(getCatalogEntry("privy.login").description));
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("double-clicking the label edits it in place; Enter commits and Escape backs out", async () => {
  const { exitCode, stderr } = await run(`${preamble}
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(card("logic.wait", "Hold on")));
    const label = container.querySelector("[data-slot='node-label']");
    await act(async () => label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const input = container.querySelector("input[aria-label='Node label']");
    assert.ok(input, "label became an input");
    assert.equal(input.value, "Hold on");
    input.value = "Wait a bit";
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(renamed, [["n1", "Wait a bit"]]);
    assert.ok(!container.querySelector("input"), "input closed after Enter");

    await act(async () => container.querySelector("[data-slot='node-label']").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const again = container.querySelector("input[aria-label='Node label']");
    again.value = "Discarded";
    await act(async () => again.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(renamed.length, 1, "Escape does not rename");
    assert.ok(!container.querySelector("input"), "input closed after Escape");
    await act(async () => root.unmount());
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test("a card outside the builder still draws: the marketplace preview has no store", async () => {
  // The real store-provider, not the mock: without a BuilderStoreProvider the label must read
  // an inert store rather than throw, which is what took the marketplace detail page down.
  const script = preamble
    .replace(/mock\.module\("\.\/store-provider"[\s\S]*?\}\)\);\n/, "")
    // The real store needs React Flow's change helpers, so the mock keeps the rest of the module.
    .replace(
      'mock.module("@xyflow/react", () => ({',
      'const realFlow = await import("@xyflow/react");\n  mock.module("@xyflow/react", () => ({ ...realFlow,',
    );
  const { exitCode, stderr } = await run(`${script}
    const html = draw("logic.condition", "Amount over 10?", {
      left: "{{input.amount}}", operator: "greater_or_equal", right: "10",
    });
    assert.match(html, /Amount over 10\\?/);
    assert.match(html, /data-family="branch"/);
  `);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
