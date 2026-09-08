export interface SandboxLimits {
  timeoutMs: number;
  memoryMb: number;
}

export interface Sandbox {
  run(code: string, input: unknown, vars: unknown, limits: SandboxLimits): Promise<unknown>;
}

export const defaultSandboxLimits: SandboxLimits = { timeoutMs: 1000, memoryMb: 32 };
