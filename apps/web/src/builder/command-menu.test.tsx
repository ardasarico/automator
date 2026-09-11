/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

/* Each scenario runs in its own process: the menu's hook mocks must not leak into the other
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
  import { act, createElement, useSyncExternalStore } from "react";
  import { createRoot } from "react-dom/client";

  GlobalRegistrator.register();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const platform = (userAgent) =>
    Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });

  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  const xyflow = await import("@xyflow/react");
  mock.module("@xyflow/react", () => ({
    ...xyflow,
    useReactFlow: () => ({ fitView: record("fitView") }),
  }));
  mock.module("../lib/hotkeys", () => ({ useHotkey() {} }));
  mock.module("./builder-dialogs", () => ({
    useBuilderDialogs: () => ({ current: "commands", open: record("open"), close() {} }),
  }));
  mock.module("./flow-canvas", () => ({
    useAddNodeAtCenter: () => record("addAtCenter"),
    useInsertNodeAtCenter: () => record("insertAtCenter"),
  }));
  mock.module("./flow-activation", () => ({ useFlowActivation: () => ({ liveMode: false }) }));
  mock.module("./presets-context", () => ({ useNodePresets: () => ({ presets: [] }) }));
  mock.module("./save-button", () => ({ useSaveFlowController: () => ({ save: record("save") }) }));
  mock.module("./use-flow-run", () => ({ useFlowRun: () => ({ run: record("run") }) }));

  // A tiny store: the menu reads the selection and the history, so the mock has to notify.
  const listeners = new Set();
  const state = {
    nodes: [],
    past: [],
    future: [],
    // No AI preview on the canvas: with one showing, the store holds undo and redo.
    preview: null,
    undo: record("undo"),
    redo: record("redo"),
    duplicateNodes: record("duplicateNodes"),
    selectAll: record("selectAll"),
    groupNodes: record("groupNodes"),
    ungroup: record("ungroup"),
  };
  const update = (patch) => {
    Object.assign(state, patch);
    listeners.forEach((listener) => listener());
  };
  mock.module("./store-provider", () => ({
    useBuilderStore: (select) =>
      useSyncExternalStore(
        (listener) => (listeners.add(listener), () => listeners.delete(listener)),
        () => select(state),
        () => select(state),
      ),
  }));
  const { CommandMenu } = await import("./command-menu");

  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const mount = async () => act(async () => root.render(createElement(CommandMenu)));
  const commands = () => Array.from(document.querySelectorAll("button[data-command]"));
  const command = (label) => {
    const match = commands().find((button) => button.dataset.command === label);
    assert.ok(match, "Missing command: " + label);
    return match;
  };
  const hint = (label) => command(label).querySelector("[data-hint]")?.textContent;
  const click = async (label) => act(async () => command(label).click());
`;

test("shortcut hints follow the reader's platform, like the header does", async () => {
  expect(
    await run(`${preamble}
      platform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      await mount();
      assert.equal(hint("Run flow"), "Ctrl+Enter");
      assert.equal(hint("Save flow"), "Ctrl+S");
      assert.equal(hint("Undo"), "Ctrl+Z");
      assert.equal(hint("Redo"), "Ctrl+Shift+Z");
      assert.equal(hint("Duplicate"), "Ctrl+D");
      assert.equal(hint("Group"), "Ctrl+G");
      assert.equal(hint("Ungroup"), "Ctrl+Shift+G");
      assert.equal(hint("Select all"), "Ctrl+A");
      assert.doesNotMatch(document.body.innerHTML, /⌘/);

      platform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      await act(async () => root.unmount());
      const again = createRoot(document.body.appendChild(document.createElement("div")));
      await act(async () => again.render(createElement(CommandMenu)));
      assert.equal(hint("Run flow"), "⌘⏎");
      assert.equal(hint("Redo"), "⌘⇧Z");
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("selection commands wait for a selection and then call the store", async () => {
  expect(
    await run(`${preamble}
      await mount();
      // Nothing selected: the commands are listed, so the shortcuts can be found, but held.
      assert.equal(command("Duplicate").disabled, true);
      assert.equal(command("Group").disabled, true);
      assert.equal(command("Ungroup").disabled, true);
      assert.equal(command("Select all").disabled, false);
      await click("Duplicate");
      assert.deepEqual(calls, []);
      await click("Select all");
      assert.deepEqual(calls, [["selectAll"]]);
      calls.length = 0;

      await act(async () =>
        update({
          nodes: [
            { id: "a", type: "flow", selected: true },
            { id: "b", type: "flow", selected: true },
            { id: "c", type: "flow", selected: false },
          ],
        }),
      );
      assert.equal(command("Ungroup").disabled, true);
      await click("Duplicate");
      await click("Group");
      assert.deepEqual(calls, [["duplicateNodes", ["a", "b"]], ["groupNodes", ["a", "b"]]]);
      calls.length = 0;

      // A selected frame is what Ungroup needs; the hotkey takes the same one.
      await act(async () =>
        update({ nodes: [{ id: "g", type: "group", selected: true }] }),
      );
      assert.equal(command("Ungroup").disabled, false);
      await click("Ungroup");
      assert.deepEqual(calls, [["ungroup", "g"]]);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("undo and redo are held until there is history, as in the header", async () => {
  expect(
    await run(`${preamble}
      await mount();
      assert.equal(command("Undo").disabled, true);
      assert.equal(command("Redo").disabled, true);
      await act(async () => update({ past: [{}], future: [{}] }));
      assert.equal(command("Undo").disabled, false);
      await click("Undo");
      await click("Redo");
      assert.deepEqual(calls, [["undo"], ["redo"]]);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("the arrow keys walk only the commands that can run", async () => {
  expect(
    await run(`${preamble}
      await mount();
      const input = document.querySelector('input[aria-label="Search commands"]');
      const key = (name) =>
        act(async () =>
          input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })),
        );
      const highlighted = () => document.querySelector("[data-active]")?.dataset.command;
      assert.equal(highlighted(), "Run flow");
      // With no history and no selection, Down from Save skips straight to Select all.
      await key("ArrowDown");
      assert.equal(highlighted(), "Save flow");
      await key("ArrowDown");
      assert.equal(highlighted(), "Select all");
      await key("ArrowUp");
      assert.equal(highlighted(), "Save flow");
      await key("ArrowUp");
      await key("ArrowUp");
      assert.equal(highlighted(), "Type to search the node catalog");
      await key("ArrowDown");
      assert.equal(highlighted(), "Run flow");
      await key("Enter");
      assert.deepEqual(calls, [["run"]]);

      // Once there is history, Undo is back in the ring.
      await act(async () => update({ past: [{}] }));
      await key("ArrowDown");
      await key("ArrowDown");
      assert.equal(highlighted(), "Undo");
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
