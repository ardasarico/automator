import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { defaultExecutors } from "./executors";

const webhook = "https://discord.com/api/webhooks/123/abc-DEF_ghi";

function flow(config: Record<string, unknown>): FlowDocument {
  return {
    version: 1,
    id: "flow",
    name: "Notify",
    description: "",
    nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
      { id: "send", type: "notify.discord", position: { x: 1, y: 0 }, label: "Send", config },
    ],
    edges: [
      { id: "e", source: "start", sourceHandle: "run", target: "send", targetHandle: "message" },
    ],
  };
}

function fetchStub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("notify.discord", () => {
  test("posts to the webhook, waits for the message, and reports where it landed", async () => {
    const { fetcher, calls } = fetchStub(200, { id: "m-7", channel_id: "c-42" });
    const run = await runFlow(
      flow({ webhookUrl: ` ${webhook} `, content: "Hello {{trigger.name}}", username: "Bot" }),
      { executors: defaultExecutors, fetch: fetcher, trigger: { payload: { name: "Arda" } } },
    );
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]?.outputs).toEqual({ sent: { messageId: "m-7", channelId: "c-42" } });
    /* The URL is trimmed before it is tested and called. */
    expect(calls[0]?.url).toBe(`${webhook}?wait=true`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      content: "Hello Arda",
      username: "Bot",
    });
    /* Every provider call carries a timeout. */
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("refuses an unresolved secret, a foreign URL, empty content, and a provider error", async () => {
    const run = async (
      config: Record<string, unknown>,
      status = 200,
      body: unknown = { id: "1" },
    ) =>
      (
        await runFlow(flow(config), {
          executors: defaultExecutors,
          fetch: fetchStub(status, body).fetcher,
        })
      ).nodes[1]?.error;
    expect(await run({ webhookUrl: "{{secrets.discord_webhook}}", content: "x" })).toBe(
      "Discord webhook URL references a secret that is not available here",
    );
    expect(await run({ webhookUrl: "https://evil.example/hook", content: "x" })).toBe(
      "Discord message needs a Discord webhook URL",
    );
    expect(await run({ webhookUrl: webhook, content: " " })).toBe(
      "Discord message content is empty",
    );
    expect(
      await run({ webhookUrl: webhook, content: "x" }, 401, {
        message: "Invalid Webhook Token",
        code: 50027,
      }),
    ).toBe("Discord answered 401: Invalid Webhook Token");
    /* A provider answer that is not JSON still reads as its status. */
    expect(await run({ webhookUrl: webhook, content: "x" }, 502, "<html>bad gateway</html>")).toBe(
      "Discord answered 502",
    );
  });

  test("a transport failure reads as Discord being unreachable, in the node's own words", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
    }) as unknown as typeof fetch;
    const run = await runFlow(flow({ webhookUrl: webhook, content: "x" }), {
      executors: defaultExecutors,
      fetch: failing,
    });
    expect(run.nodes[1]?.error).toBe("Could not reach Discord: getaddrinfo ENOTFOUND");
  });

  test("posts structured content as JSON", async () => {
    const { fetcher, calls } = fetchStub(200, { id: "1" });
    await runFlow(flow({ webhookUrl: webhook, content: "{{trigger}}" }), {
      executors: defaultExecutors,
      fetch: fetcher,
      trigger: { payload: { price: 42 } },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ content: '{"price":42}' });
  });
});
