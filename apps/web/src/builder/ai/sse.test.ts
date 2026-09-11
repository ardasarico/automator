import { describe, expect, test } from "bun:test";
import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  test("splits complete frames and keeps the remainder", () => {
    const { events, rest } = parseSseFrames(
      'data: {"type":"done"}\n\ndata: {"type":"text.delta","de',
    );
    expect(events).toEqual([{ type: "done" }]);
    expect(rest).toBe('data: {"type":"text.delta","de');
  });
  test("ignores comments and blank frames", () => {
    expect(parseSseFrames(': keep-alive\n\n\n\ndata: {"type":"done"}\n\n').events).toEqual([
      { type: "done" },
    ]);
  });
  test("rejects a frame that is not an event", () => {
    expect(() => parseSseFrames('data: {"type":"nope"}\n\n')).toThrow(/invalid_response/);
  });
});
