import type { AiStreamEvent } from "@automator/contracts";

/** JSON never contains a raw newline, so one `data:` line per event is enough. */
export function encodeSseEvent(event: AiStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
