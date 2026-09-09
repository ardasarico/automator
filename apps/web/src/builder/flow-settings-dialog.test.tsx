/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

/*
 * Run in a child process, as the canvas header suite does. `mock.module` writes to Bun's shared
 * registry, so a sibling suite that mocks part of `../flows/client` would otherwise leave this
 * one importing a stub with no `setFlowEnabledRequest`, and a suite that mounts a real dialog
 * would in turn leak its own mocks into everyone else's.
 */
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

/* A scheduled payout with no recipient: one error the canvas sees and the API refuses. */
const preamble = `
  import assert from "node:assert/strict";
  import { mock } from "bun:test";
  import { GlobalRegistrator } from "@happy-dom/global-registrator";
  import { act, createElement } from "react";

  GlobalRegistrator.register();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  mock.module("../auth/access-token", () => ({
    e2eSession: false,
    useAccessToken: () => async () => "privy-token",
  }));
  // Panels of their own, each fetching on mount; not what these tests are about.
  mock.module("./trigger-issues", () => ({ TriggerIssues: () => null }));
  mock.module("./wallet-funds", () => ({ WalletFunds: () => null }));
  mock.module("./enable-signing-button", () => ({ EnableSigningButton: () => null }));

  const broken = {
    version: 1,
    id: "flow-id",
    name: "Weekly payout",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.schedule", position: { x: 0, y: 0 }, label: "Every week", config: {} },
      {
        id: "n2",
        type: "usdc.payout",
        position: { x: 300, y: 0 },
        label: "Pay the crew",
        config: { to: "", amount: "10" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "tick", targetHandle: "in" }],
  };

  let answer = { status: 200, body: null };
  globalThis.fetch = async () =>
    answer.status === 200
      ? Response.json({
          flow: broken,
          createdAt: "2026-09-10T00:00:00.000Z",
          updatedAt: "2026-09-10T00:00:00.000Z",
          enabled: true,
        })
      : Response.json(answer.body, { status: answer.status });

  const { createRoot } = await import("react-dom/client");
  const { FlowActivationProvider } = await import("./flow-activation");
  const { FlowSettingsDialog } = await import("./flow-settings-dialog");
  const { BuilderStoreProvider } = await import("./store-provider");

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        BuilderStoreProvider,
        { document: broken },
        createElement(
          FlowActivationProvider,
          { enabled: false, appPublished: false, webhookToken: null },
          createElement(FlowSettingsDialog, { onClose: () => {} }),
        ),
      ),
    );
  });

  // The Switch renders a hidden checkbox carrying the id, beside the control the reader clicks.
  const activeSwitch = () => window.document.querySelector("#flow-active");
  const isActive = () => activeSwitch().checked;
  const alerts = () =>
    Array.from(window.document.querySelectorAll('[role="alert"]')).map((node) =>
      node.textContent.replace(/\\s+/g, " ").trim(),
    );
  const toggle = async () => act(async () => activeSwitch().click());

  // Mounts a flow the canvas finds nothing wrong with, standing in for one saved before a check
  // existed: the server still refuses it, and the dialog has no local list to show.
  const remountHealthy = async () => {
    const healthy = {
      ...broken,
      nodes: [
        broken.nodes[0],
        { ...broken.nodes[1], config: { to: "0x" + "1".repeat(40), amount: "10" } },
      ],
    };
    healthy.nodes[0] = { ...healthy.nodes[0], config: { every: "1h" } };
    await act(async () => root.unmount());
    const next = createRoot(container);
    await act(async () => {
      next.render(
        createElement(
          BuilderStoreProvider,
          { document: healthy },
          createElement(
            FlowActivationProvider,
            { enabled: false, appPublished: false, webhookToken: null },
            createElement(FlowSettingsDialog, { onClose: () => {} }),
          ),
        ),
      );
    });
  };
`;

test("a refused activation names the problems that blocked it", async () => {
  const result = await run(`${preamble}
    assert.deepEqual(alerts(), []);
    answer = { status: 422, body: { error: "invalid_flow" } };
    await toggle();
    const [message] = alerts();
    assert.match(message, /This flow still has problems, so it was not turned on\\./);
    assert.match(message, /“Pay the crew” needs a recipient address\\./);
    // The switch stays off: the flow was not activated.
    assert.equal(isActive(), false);
    // Warnings are not blockers, so nothing advisory joins the list.
    assert.doesNotMatch(message, /set your own/);
    assert.doesNotMatch(message, /Simulate/);
    console.log("ok");
    process.exit(0);
  `);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("ok");
});

test("a failure that is not about the flow keeps the plain message", async () => {
  const result = await run(`${preamble}
    answer = { status: 503, body: { error: "unavailable" } };
    await toggle();
    assert.deepEqual(alerts(), ["The change could not be saved. Please try again."]);
    assert.equal(isActive(), false);
    console.log("ok");
    process.exit(0);
  `);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("ok");
});

test("a successful activation reports nothing and turns the switch on", async () => {
  const result = await run(`${preamble}
    await toggle();
    assert.deepEqual(alerts(), []);
    assert.equal(isActive(), true);
    console.log("ok");
    process.exit(0);
  `);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("ok");
});

test("a refusal the canvas cannot explain says so instead of showing an empty list", async () => {
  const result = await run(`${preamble}
    await remountHealthy();
    answer = { status: 422, body: { error: "invalid_flow" } };
    await toggle();
    const [message] = alerts();
    assert.match(message, /The saved flow has problems this editor cannot see/);
    assert.match(message, /Reload the page to fetch the saved flow/);
    // Never a bare refusal over nothing, and never silently swallowed.
    assert.equal(alerts().length, 1);
    assert.equal(isActive(), false);
    console.log("ok");
    process.exit(0);
  `);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("ok");
});
