import { Type } from "@sinclair/typebox";

/*
 * The payload Simulate hands a trigger, kept apart from the trigger configs themselves so a
 * trigger defined in its own module can carry one without importing the whole config registry.
 */

export function samplePayloadField(sample: unknown) {
  return Type.String({
    default: JSON.stringify(sample, null, 2),
    description: "Payload Simulate hands to this trigger",
    contentMediaType: "application/json",
    advanced: true,
  });
}

export function parseSamplePayload(config: unknown): unknown {
  if (typeof config !== "object" || config === null) return {};
  const text = (config as { samplePayload?: unknown }).samplePayload;
  if (typeof text !== "string" || text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export function samplePayloadProblem(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
    return null;
  } catch {
    return "Invalid JSON";
  }
}
