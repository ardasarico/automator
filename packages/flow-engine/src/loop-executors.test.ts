import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { defaultExecutors } from "./executors";
import { loopExecutors } from "./loop-executors";
import type { Sandbox } from "./sandbox";

const executors = { ...defaultExecutors, ...loopExecutors };

function flow(code: string): FlowDocument {
  return {
    version: 1,
    id: "flow",
    name: "Code",
    description: "",
    nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
      {
        id: "code",
        type: "logic.run-code",
        position: { x: 1, y: 0 },
        label: "Code",
        config: { code },
      },
    ],
    edges: [
      { id: "e", source: "start", sourceHandle: "run", target: "code", targetHandle: "input" },
    ],
  };
}

/** A stand-in for the API's sandbox: plain evaluation is fine inside a test. */
const evalSandbox: Sandbox = {
  async run(code, input, vars) {
    return new Function("input", "vars", code)(input, vars);
  },
};

describe("logic.run-code", () => {
  test("runs the body against the input and vars through the sandbox", async () => {
    const run = await runFlow(flow("return { doubled: input.n * 2, who: vars.who };"), {
      executors,
      trigger: { payload: { n: 21 } },
      sandbox: evalSandbox,
    } as Parameters<typeof runFlow>[1]);
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]?.outputs).toEqual({ output: { doubled: 42 } });
  });

  test("fails readably without a sandbox, with empty code, or with a non-JSON result", async () => {
    const errorOf = async (code: string, sandbox?: Sandbox) =>
      (await runFlow(flow(code), { executors, sandbox } as Parameters<typeof runFlow>[1])).nodes[1]
        ?.error;
    expect(await errorOf("return 1;")).toBe(
      "Run code needs the server sandbox; it cannot run in the browser preview",
    );
    expect(await errorOf("  ", evalSandbox)).toBe("Run code has no code to run");
    expect(await errorOf("return () => 1;", evalSandbox)).toBe("Run code must return a JSON value");
    expect(await errorOf("throw new Error('boom');", evalSandbox)).toBe("Run code failed: boom");
    expect(await errorOf("return undefined;", evalSandbox)).toBeUndefined();
  });
});
