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
        const __input = ${JSON.stringify(input ?? null)};
        const __vars = ${JSON.stringify(vars ?? {})};
        const __result = (function (input, vars) {\n${code}\n})(__input, __vars);
        __result === undefined ? undefined : JSON.parse(JSON.stringify(__result, (_key, value) => {
          if (typeof value === "number" && !Number.isFinite(value))
            throw new Error("Run code returned a non-finite number; check its numeric inputs.");
          return value;
        }));
      `;
      try {
        return QuickJS.evalCode(script, {
          shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + limits.timeoutMs),
          memoryLimitBytes: limits.memoryMb * 1024 * 1024,
          maxStackSizeBytes: 512 * 1024,
        });
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
