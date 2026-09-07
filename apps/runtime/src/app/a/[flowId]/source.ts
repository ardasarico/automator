/**
 * Where `/a/[flowId]` takes its mini-app from: a published flow plays through API sessions;
 * an unpublished one, or any request with `?preview`, plays the document in the URL fragment
 * in the visitor's own browser (the builder's preview of an unsaved canvas).
 */
export type RuntimeSource = "session" | "fragment";

export function resolveRuntimeSource(input: {
  hasPreviewFlag: boolean;
  /** Whether the public summary read found a published flow; null when it was not attempted. */
  published: boolean | null;
}): RuntimeSource {
  if (input.hasPreviewFlag) return "fragment";
  return input.published ? "session" : "fragment";
}
