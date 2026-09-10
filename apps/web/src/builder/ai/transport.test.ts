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
