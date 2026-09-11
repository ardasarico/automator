import { aiStreamEventSchema, Value, type AiStreamEvent } from "@automator/contracts";
import { AiRequestError } from "./transport";

/**
 * Splits complete `text/event-stream` frames (each `\n\n`-terminated) off the front of a growing
 * buffer, leaving whatever comes after the last blank line for the next chunk. Comment lines
 * (`: keep-alive`) and frames without a `data:` line are skipped, matching the SSE spec.
 */
export function parseSseFrames(buffer: string): { events: AiStreamEvent[]; rest: string } {
  const events: AiStreamEvent[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf("\n\n");
    if (end === -1) break;
    const frame = rest.slice(0, end);
    rest = rest.slice(end + 2);
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new AiRequestError("invalid_response", "The stream sent something that was not JSON.");
    }
    if (!Value.Check(aiStreamEventSchema, parsed))
      throw new AiRequestError(
        "invalid_response",
        "The stream sent an event this app does not know.",
      );
    events.push(parsed);
  }
  return { events, rest };
}
