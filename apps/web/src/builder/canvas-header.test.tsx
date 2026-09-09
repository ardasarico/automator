/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

async function render(script: string) {
  // Keep hook mocks out of the other builder suites in Bun's shared module registry.
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
  import { mock } from "bun:test";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";

  let liveMode = false;
  let enabled = false;
  let triggers = [];
  let activeId = null;
  mock.module("./flow-activation", () => ({
    useFlowActivation: () => ({ enabled, liveMode, setLiveMode(next) { liveMode = next; } }),
  }));
  mock.module("./use-flow-run", () => ({
    useFlowRun: () => ({ running: false, error: null, run() {}, stop() {} }),
    useSimulationTriggers: () => ({ triggers, activeId }),
  }));
  mock.module("./use-select-node", () => ({ useSelectNode: () => () => {} }));
  mock.module("./run-store-provider", () => ({ useRunStore: () => null }));
  mock.module("./save-button", () => ({
    SaveButton: () => null,
    useSaveFlowController: () => ({ save() {} }),
  }));
  mock.module("./publish-button", () => ({ PublishButton: () => null }));
  mock.module("./use-canvas-hotkeys", () => ({ useCanvasHotkeys() {} }));
  mock.module("./flow-problems-button", () => ({ FlowProblemsButton: () => null }));
  mock.module("./builder-dialogs", () => ({ useBuilderDialogs: () => ({ open() {} }) }));
  mock.module("./store-provider", () => ({
    useBuilderStore: (select) =>
      select({ meta: {}, past: [], future: [], undo() {}, redo() {} }),
  }));
  // A closed menu renders nothing, so static markup cannot see an error inside its popup — such
  // as a Base UI part used outside the context it needs. Rendering the popup inline, with every
  // other menu part left real, puts its contents back under the assertions below.
  const menu = await import("@automator/ui/menu");
  mock.module("@automator/ui/menu", () => ({
    ...menu,
    MenuPopup: ({ children }) => createElement("div", { "data-slot": "menu-popup" }, children),
  }));
  const { CanvasHeader } = await import("./canvas-header");
  const draw = () => renderToStaticMarkup(createElement(CanvasHeader));

`;

test("the header shows the run mode and names live transactions in live mode", async () => {
  expect(
    await render(`
      ${preamble}
      const simulated = draw();
      // The mode control names both modes whichever one is selected.
      assert.match(simulated, /Simulate/);
      assert.match(simulated, /Live/);
      assert.doesNotMatch(simulated, /Run live/);
      // Undo and redo are reachable without the keyboard, and disabled with no history.
      assert.match(simulated, /aria-label="Undo \\(/);
      assert.match(simulated, /aria-label="Redo \\(/);

      liveMode = true;
      assert.match(draw(), /Run live/);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("only a flow with more than one starting trigger gets a trigger picker", async () => {
  expect(
    await render(`
      ${preamble}
      // No trigger and a single trigger both leave the header as clean as it was.
      assert.doesNotMatch(draw(), /Starting trigger/);
      triggers = [{ id: "a", type: "trigger.schedule", label: "Every hour" }];
      activeId = "a";
      assert.doesNotMatch(draw(), /Starting trigger/);

      triggers = [
        { id: "a", type: "trigger.schedule", label: "Every hour" },
        { id: "b", type: "trigger.miniapp-open", label: "" },
      ];
      const both = draw();
      // The header names the trigger the next run will start from.
      assert.match(both, /aria-label="Starting trigger: Every hour"/);
      assert.match(both, /Every hour/);

      // Selecting the second trigger on the canvas moves the run to it.
      activeId = "b";
      assert.match(draw(), /aria-label="Starting trigger: Mini-app opened"/);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("the trigger picker's menu renders and lists every starting trigger", async () => {
  expect(
    await render(`
      ${preamble}
      triggers = [
        { id: "a", type: "trigger.schedule", label: "Every hour" },
        { id: "b", type: "trigger.miniapp-open", label: "" },
      ];
      activeId = "a";
      // Rendering at all is half the assertion: a menu part outside its group throws here.
      const opened = draw();
      const count = (needle) => opened.split(needle).length - 1;
      assert.equal(count("Start the run from"), 1);
      // The chosen trigger names the button, the button's label and its own row; the other one
      // only has a row.
      assert.equal(count("Every hour"), 3);
      assert.equal(count("Mini-app opened"), 1);
      // A renamed trigger names its kind under it; one still called by its kind does not repeat it.
      assert.equal(count("Schedule"), 1);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("an active flow says so in the header, apart from the run mode", async () => {
  expect(
    await render(`
      ${preamble}
      assert.doesNotMatch(draw(), /Active flow/);
      enabled = true;
      const active = draw();
      assert.match(active, /aria-label="Active flow: open Flow settings"/);
      assert.match(active, /Active</);
      // Activation is the flow's state, not the transaction mode beside it.
      assert.match(active, /aria-label="Run mode"/);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
