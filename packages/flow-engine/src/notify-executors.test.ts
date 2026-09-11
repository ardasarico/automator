import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { defaultExecutors } from "./executors";
import { notifyExecutors } from "./notify-executors";

const executors = { ...defaultExecutors, ...notifyExecutors };

function flow(
  type: "notify.telegram" | "notify.email",
  config: Record<string, unknown>,
): FlowDocument {
  return {
    version: 1,
    id: "flow",
    name: "Notify",
    description: "",
    nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
      { id: "send", type, position: { x: 1, y: 0 }, label: "Send", config },
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
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("notify.telegram", () => {
  const token = "123456789:AAFfakefakefakefakefakefakefakefake";

  test("posts to the bot's sendMessage endpoint and reports the message", async () => {
    const { fetcher, calls } = fetchStub(200, {
      ok: true,
      result: { message_id: 7, chat: { id: 42 } },
    });
    const run = await runFlow(
      flow("notify.telegram", { botToken: token, chatId: "42", text: "Hello {{trigger.name}}" }),
      { executors, fetch: fetcher, trigger: { payload: { name: "Arda" } } },
    );
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]?.outputs).toEqual({ sent: { messageId: 7, chatId: 42 } });
    expect(calls[0]?.url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ chat_id: "42", text: "Hello Arda" });
  });

  test("refuses an unresolved secret, a bad token, and a provider error", async () => {
    const run = async (
      config: Record<string, unknown>,
      status = 200,
      body: unknown = { ok: true },
    ) =>
      (
        await runFlow(flow("notify.telegram", config), {
          executors,
          fetch: fetchStub(status, body).fetcher,
        })
      ).nodes[1]?.error;
    expect(await run({ botToken: "{{secrets.telegram_bot_token}}", chatId: "1", text: "x" })).toBe(
      "Telegram bot token references a secret that is not available here",
    );
    expect(await run({ botToken: "nope", chatId: "1", text: "x" })).toBe(
      "Telegram message needs a bot token",
    );
    expect(await run({ botToken: token, chatId: "", text: "x" })).toBe(
      "Telegram message needs a chat id",
    );
    expect(await run({ botToken: token, chatId: "1", text: " " })).toBe(
      "Telegram message text is empty",
    );
    expect(
      await run({ botToken: token, chatId: "1", text: "x" }, 400, {
        ok: false,
        description: "chat not found",
      }),
    ).toBe("Telegram answered 400: chat not found");
  });

  test("trims the token, carries a timeout, and names Telegram when the call never lands", async () => {
    const { fetcher, calls } = fetchStub(200, { ok: true, result: {} });
    const run = await runFlow(
      flow("notify.telegram", { botToken: ` ${token} `, chatId: " 42 ", text: "x" }),
      { executors, fetch: fetcher },
    );
    expect(run.status).toBe("succeeded");
    expect(calls[0]?.url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    const failing = (async () => {
      throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") });
    }) as unknown as typeof fetch;
    const failed = await runFlow(
      flow("notify.telegram", { botToken: token, chatId: "1", text: "x" }),
      { executors, fetch: failing },
    );
    expect(failed.nodes[1]?.error).toBe("Could not reach Telegram: ECONNRESET");
  });
});

describe("notify.email", () => {
  test("sends through Resend with a bearer key and lists the recipients", async () => {
    const { fetcher, calls } = fetchStub(200, { id: "email-1" });
    const run = await runFlow(
      flow("notify.email", {
        apiKey: "re_test_key",
        from: "Automator <hello@example.com>",
        to: "a@example.com, b@example.com",
        subject: "Hi",
        text: "Body",
      }),
      { executors, fetch: fetcher },
    );
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]?.outputs).toEqual({
      sent: { id: "email-1", to: ["a@example.com", "b@example.com"] },
    });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
  });

  test("checks the key, sender, recipients and subject before calling out", async () => {
    const run = async (config: Record<string, unknown>) =>
      (
        await runFlow(
          flow("notify.email", {
            apiKey: "re_k",
            from: "a@x.io",
            to: "b@x.io",
            subject: "s",
            ...config,
          }),
          {
            executors,
            fetch: fetchStub(200, { id: "1" }).fetcher,
          },
        )
      ).nodes[1]?.error;
    expect(await run({ apiKey: "{{secrets.resend_api_key}}" })).toBe(
      "Resend API key references a secret that is not available here",
    );
    expect(await run({ apiKey: "sk_wrong" })).toBe("Email needs a Resend API key");
    expect(await run({ from: " " })).toBe("Email needs a sender address");
    expect(await run({ to: " , " })).toBe("Email needs at least one recipient");
    expect(await run({ subject: "" })).toBe("Email needs a subject");
  });

  test("trims the key and sender, carries a timeout, and names Resend when the call never lands", async () => {
    const { fetcher, calls } = fetchStub(200, { id: "email-2" });
    const run = await runFlow(
      flow("notify.email", {
        apiKey: " re_test_key ",
        from: " a@x.io ",
        to: "b@x.io",
        subject: "s",
        text: "Body",
      }),
      { executors, fetch: fetcher },
    );
    expect(run.status).toBe("succeeded");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(String(calls[0]?.init?.body)).from).toBe("a@x.io");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    const failing = (async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    const failed = await runFlow(
      flow("notify.email", { apiKey: "re_k", from: "a@x.io", to: "b@x.io", subject: "s" }),
      { executors, fetch: failing },
    );
    expect(failed.nodes[1]?.error).toBe("Could not reach Resend: the request timed out");
  });
});
