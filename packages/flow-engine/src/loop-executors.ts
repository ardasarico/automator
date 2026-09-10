import { runCodeConfigSchema } from "@automator/contracts";
import { NodeExecutionError, type ExecutionContext, type ExecutorRegistry } from "./executor";
import { defaultSandboxLimits, type Sandbox } from "./sandbox";

function sandboxOf(context: ExecutionContext): Sandbox | undefined {
  return (context as ExecutionContext & { sandbox?: Sandbox }).sandbox;
}

export const loopExecutors: ExecutorRegistry = {
  "logic.run-code": {
    kind: "step",
    async run(context) {
      const sandbox = sandboxOf(context);
      if (!sandbox)
        throw new NodeExecutionError(
          "Run code needs the server sandbox; it cannot run in the browser preview",
        );
      const { code } = context.config(runCodeConfigSchema);
      if (!code.trim()) throw new NodeExecutionError("Run code has no code to run");
      const input = context.inputs.input;
      let output: unknown;
      try {
        output = await sandbox.run(code, input, context.variables, defaultSandboxLimits);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new NodeExecutionError(`Run code failed: ${message}`);
      }
      if (output === undefined) return { output: null };
      const json = JSON.stringify(output);
      if (json === undefined) throw new NodeExecutionError("Run code must return a JSON value");
      return { output: JSON.parse(json) as unknown };
    },
  },
};
