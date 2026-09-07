/**
 * The seam through which `logic.run-code` executes user code. The engine never evaluates
 * code itself: the API passes a sandbox backed by an isolated interpreter (QuickJS in WASM)
 * with no host bindings, and the browser preview passes none, so the node fails readably.
 */
export interface SandboxLimits {
  /** Wall-clock budget for one evaluation. */
  timeoutMs: number;
  /** Heap the interpreter may allocate. */
  memoryMb: number;
}

export interface Sandbox {
  /**
   * Runs `code` as the body of `function (input, vars) { … }` against JSON copies of both
   * arguments and returns the JSON-serialisable result. Rejects with the thrown error's
   * message, or a timeout/memory message, and never with host state.
   */
  run(code: string, input: unknown, vars: unknown, limits: SandboxLimits): Promise<unknown>;
}

export const defaultSandboxLimits: SandboxLimits = { timeoutMs: 1000, memoryMb: 32 };
