import { emailConfigSchema, telegramMessageConfigSchema } from "@automator/contracts";
import { NodeExecutionError, type ExecutorRegistry } from "./executor";

/** A secret the API did not resolve (the browser preview, or a missing secret) still reads as a template. */
const unresolvedSecret = /\{\{\s*secrets\./;

function requireResolved(value: string, what: string): string {
  if (unresolvedSecret.test(value))
    throw new NodeExecutionError(`${what} references a secret that is not available here`);
  return value;
}

/** Telegram bot tokens look like `123456789:AAF…`, at least 30 characters after the colon. */
const telegramToken = /^\d+:[\w-]{30,}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
}

/** Notification nodes beyond Discord; each fires `sent` with what the provider acknowledged. */
export const notifyExecutors: ExecutorRegistry = {
  "notify.telegram": {
    kind: "step",
    async run(context) {
      const config = context.config(telegramMessageConfigSchema);
      const token = requireResolved(config.botToken, "Telegram bot token");
      if (!telegramToken.test(token))
        throw new NodeExecutionError("Telegram message needs a bot token");
      const chatId = config.chatId.trim();
      if (!chatId) throw new NodeExecutionError("Telegram message needs a chat id");
      const body = text(config.text).trim();
      if (!body) throw new NodeExecutionError("Telegram message text is empty");
      const response = await context.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: body }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number; chat?: { id?: number } };
      };
      if (!response.ok || !answer.ok)
        throw new NodeExecutionError(
          `Telegram answered ${response.status}${answer.description ? `: ${answer.description}` : ""}`,
        );
      return {
        sent: {
          messageId: answer.result?.message_id ?? null,
          chatId: answer.result?.chat?.id ?? chatId,
        },
      };
    },
  },

  "notify.email": {
    kind: "step",
    async run(context) {
      const config = context.config(emailConfigSchema);
      const apiKey = requireResolved(config.apiKey, "Resend API key");
      if (!apiKey.startsWith("re_")) throw new NodeExecutionError("Email needs a Resend API key");
      const to = config.to
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean);
      if (!config.from.trim()) throw new NodeExecutionError("Email needs a sender address");
      if (to.length === 0) throw new NodeExecutionError("Email needs at least one recipient");
      if (!config.subject.trim()) throw new NodeExecutionError("Email needs a subject");
      const response = await context.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: config.from.trim(),
          to,
          subject: config.subject,
          text: text(config.text),
        }),
      });
      const answer = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok)
        throw new NodeExecutionError(
          `Resend answered ${response.status}${answer.message ? `: ${answer.message}` : ""}`,
        );
      return { sent: { id: answer.id ?? null, to } };
    },
  },
};
