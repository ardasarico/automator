/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, describe, expect, test } from "bun:test";

GlobalRegistrator.register();

const { AiRequestError, sendAiMessage } = await import("./transport");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});

/** A stream that hands out one chunk per pull, so a frame can be split across reads. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

/** Same, but the chunks are already bytes, so a split can land inside one character's encoding. */
function streamOfBytes(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
  });
}

describe("sendAiMessage", () => {
  test("delivers every event in order even when a frame is split across chunks", async () => {
    const chunks = [
      'data: {"type":"message","id":"m1"}\n\ndata: {"type":"text.delta","delta":"Hel',
      'lo"}\n\ndata: {"type":"done"}\n\n',
    ];
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calledUrl = String(url);
      calledInit = init;
      return new Response(streamOf(chunks), { status: 200 });
    }) as unknown as typeof fetch;

    const events: unknown[] = [];
    await sendAiMessage("token-1", "flow-1", { text: "hi" }, (event) => events.push(event));

    expect(events).toEqual([
      { type: "message", id: "m1" },
      { type: "text.delta", delta: "Hello" },
      { type: "done" },
    ]);
    expect(calledUrl).toBe("/api/flows/flow-1/ai/messages");
    expect((calledInit?.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
  });

  test("delivers a multi-byte character split mid-byte-sequence across chunks", async () => {
    // A 4-byte UTF-8 emoji; the split lands after its second byte, not on a character boundary.
    const prefix = 'data: {"type":"text.delta","delta":"';
    const emoji = "\u{1F600}";
    const suffix = '"}\n\ndata: {"type":"done"}\n\n';
    const full = new TextEncoder().encode(prefix + emoji + suffix);
    const splitAt = new TextEncoder().encode(prefix).length + 2;
    const chunks = [full.slice(0, splitAt), full.slice(splitAt)];

    globalThis.fetch = (async () =>
      new Response(streamOfBytes(chunks), { status: 200 })) as unknown as typeof fetch;

    const events: unknown[] = [];
    await sendAiMessage("token-1", "flow-1", { text: "hi" }, (event) => events.push(event));

    expect(events).toEqual([{ type: "text.delta", delta: emoji }, { type: "done" }]);
  });

  test("a 429 response becomes an AiRequestError with code rate_limited", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { error: "rate_limited", detail: "Too many requests." },
        { status: 429 },
      )) as unknown as typeof fetch;

    const events: unknown[] = [];
    let caught: unknown;
    try {
      await sendAiMessage("token-1", "flow-1", { text: "hi" }, (event) => events.push(event));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiRequestError);
    expect((caught as InstanceType<typeof AiRequestError>).code).toBe("rate_limited");
    expect(events).toHaveLength(0);
  });
});
