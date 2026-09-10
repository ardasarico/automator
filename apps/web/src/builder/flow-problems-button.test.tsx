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

  let problems = [];
  mock.module("./use-flow-problems", () => ({ useFlowProblems: () => problems }));
  mock.module("./validation", () => ({
    countErrors: (list) => list.filter((problem) => problem.severity === "error").length,
  }));
  mock.module("./use-select-node", () => ({ useSelectNode: () => () => {} }));
  mock.module("./store", () => ({ selectFlowNodes: (state) => state.nodes }));
  mock.module("@xyflow/react", () => ({ useReactFlow: () => ({ fitView() {} }) }));
  mock.module("./store-provider", () => ({
    useBuilderStore: (select) =>
      select({
        nodes: [{ id: "n1", data: { type: "logic.wait", label: "Hold on" } }],
      }),
  }));
  // A closed menu renders nothing, so static markup cannot see an error inside its popup — such
  // as a Base UI part used outside the context it needs. Rendering the popup inline, with every
  // other menu part left real, puts its contents back under the assertions below.
  const menu = await import("@automator/ui/menu");
  mock.module("@automator/ui/menu", () => ({
    ...menu,
    MenuPopup: ({ children }) => createElement("div", { "data-slot": "menu-popup" }, children),
  }));
  const { FlowProblemsButton } = await import("./flow-problems-button");
  const draw = () => renderToStaticMarkup(createElement(FlowProblemsButton));
`;

test("a flow with no problems gets no control", async () => {
  expect(
    await render(`
      ${preamble}
      assert.equal(draw(), "");
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("the problems menu renders, counts and names the node each problem belongs to", async () => {
  expect(
    await render(`
      ${preamble}
      problems = [
        { severity: "error", message: "The flow is empty. Add a trigger to start from." },
        { severity: "warning", nodeId: "n1", message: "Seconds must be at least 1." },
      ];
      // Rendering at all is half the assertion: a menu part outside its group throws here.
      const opened = draw();
      assert.match(opened, /2 problems/);
      assert.match(opened, /Problems to fix before running/);
      assert.match(opened, /The flow is empty/);
      assert.match(opened, /Seconds must be at least 1/);
      // A problem that belongs to a node names it; one about the whole flow has nothing to name.
      assert.match(opened, /Hold on/);

      // Warnings alone are still worth listing, under a heading that does not overstate them.
      problems = [{ severity: "warning", nodeId: "n1", message: "Seconds must be at least 1." }];
      const warned = draw();
      assert.match(warned, /1 problem</);
      assert.match(warned, /Warnings/);
      assert.doesNotMatch(warned, /Problems to fix before running/);
    `),
  ).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});
