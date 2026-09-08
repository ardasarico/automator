export type RuntimeSource = "session" | "preview" | "missing";

export function resolveRuntimeSource(input: {
  hasPreviewFlag: boolean;
  published: boolean | null;
}): RuntimeSource {
  if (input.hasPreviewFlag) return "preview";
  return input.published ? "session" : "missing";
}
