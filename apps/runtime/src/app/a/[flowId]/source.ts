export type RuntimeSource = "session" | "preview" | "missing";

export function resolveRuntimeSource(input: {
  hasPreviewFlag: boolean;
  /** Whether the public summary read found a published flow; null when it was not attempted. */
  published: boolean | null;
}): RuntimeSource {
  if (input.hasPreviewFlag) return "preview";
  return input.published ? "session" : "missing";
}
