import { expect, test } from "bun:test";
import { encodeSseEvent } from "./sse";

test("one event is one data frame", () => {
  expect(encodeSseEvent({ type: "text.delta", delta: "a\nb" })).toBe(
    'data: {"type":"text.delta","delta":"a\\nb"}\n\n',
  );
});
