import type { Sandbox } from "@automator/flow-engine";
import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

/**
 * The API's sandbox for `logic.run-code`: QuickJS compiled to WebAssembly, a fresh VM per
 * evaluation with no host bindings at all (no fetch, timers, files or process), a memory
 * limit and a wall-clock deadline enforced by the interpreter's interrupt handler. Input and
 * vars cross the boundary as JSON text, so the code sees copies, never host objects.
 */
export function createQuickJsSandbox(): Sandbox {
  const loading = getQuickJS();
  return {
    async run(code, input, vars, limits) {
      const QuickJS = await loading;
      const script = `
        (() => {
          const stringify = JSON.stringify;
          const isFinite = Number.isFinite;
          const ErrorType = Error;
          const input = JSON.parse(${JSON.stringify(JSON.stringify(input ?? null))});
          const vars = JSON.parse(${JSON.stringify(JSON.stringify(vars ?? {}))});
          const result = new Function("input", "vars", ${JSON.stringify(code)})(input, vars);
          if (result === undefined) return undefined;
          if (result !== null && typeof result.then === "function")
            throw new ErrorType("Run code must return a JSON value synchronously, not a Promise.");
          const json = stringify(result, (_key, value) => {
            if (typeof value === "number" && !isFinite(value))
              throw new ErrorType("Run code returned a non-finite number; check its numeric inputs.");
            return value;
          });
          if (json === undefined) throw new ErrorType("Run code must return a JSON value.");
          return json;
        })();
      `;
      try {
        const json = QuickJS.evalCode(script, {
          shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + limits.timeoutMs),
          memoryLimitBytes: limits.memoryMb * 1024 * 1024,
          maxStackSizeBytes: 512 * 1024,
        });
        // Only text crosses back: VM code cannot replace the host's JSON decoder.
        if (json === undefined) return undefined;
        if (typeof json !== "string") throw new Error("Run code must return a JSON value.");
        return JSON.parse(json) as unknown;
      } catch (error) {
        throw new Error(describe(error, limits.timeoutMs));
      }
    },
  };
}

/** QuickJS reports errors as `{ name, message }` dumps; interrupts as an InternalError. */
function describe(error: unknown, timeoutMs: number): string {
  const record = error as { name?: string; message?: string } | null;
  const name = record?.name ?? "";
  const message = record?.message ?? (typeof error === "string" ? error : "");
  if (name === "InternalError" && /interrupted/i.test(message))
    return `timed out after ${timeoutMs} ms`;
  if (/out of memory/i.test(message)) return "ran out of memory";
  return message || name || "unknown error";
}
