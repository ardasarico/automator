/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("the header shows the run mode and names live transactions in live mode", async () => {
  // Keep hook mocks out of the other builder suites in Bun's shared module registry.
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
        import assert from "node:assert/strict";
        import { mock } from "bun:test";
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";

        let liveMode = false;
        mock.module("./flow-activation", () => ({
          useFlowActivation: () => ({ liveMode, setLiveMode(next) { liveMode = next; } }),
        }));
        mock.module("./use-flow-run", () => ({
          useFlowRun: () => ({ running: false, error: null, run() {}, stop() {} }),
        }));
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
        const { CanvasHeader } = await import("./canvas-header");

        const simulated = renderToStaticMarkup(createElement(CanvasHeader));
        // The mode control names both modes whichever one is selected.
        assert.match(simulated, /Simulate/);
        assert.match(simulated, /Live/);
        assert.doesNotMatch(simulated, /Run live/);
        // Undo and redo are reachable without the keyboard, and disabled with no history.
        assert.match(simulated, /aria-label="Undo \\(/);
        assert.match(simulated, /aria-label="Redo \\(/);

        liveMode = true;
        const live = renderToStaticMarkup(createElement(CanvasHeader));
        assert.match(live, /Run live/);
      `,
    ],
    {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
