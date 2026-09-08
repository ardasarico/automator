/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("the run button names live transactions when live mode is enabled", async () => {
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
        mock.module("./flow-activation", () => ({ useFlowActivation: () => ({ liveMode }) }));
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
        mock.module("./use-flow-problems", () => ({ useFlowProblems: () => [] }));
        const { CanvasHeader } = await import("./canvas-header");

        const simulated = renderToStaticMarkup(createElement(CanvasHeader));
        assert.match(simulated, /Simulate/);
        assert.doesNotMatch(simulated, /Run live/);

        liveMode = true;
        const live = renderToStaticMarkup(createElement(CanvasHeader));
        assert.match(live, /Run live/);
        assert.doesNotMatch(live, /Simulate/);
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
