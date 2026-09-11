import { emailConfigSchema, telegramMessageConfigSchema } from "@automator/contracts";
import { NodeExecutionError, type ExecutorRegistry } from "./executor";
import { valueText } from "./template";
import { providerSignal, reach, requireResolved } from "./transport";

const telegramToken = /^\d+:[\w-]{30,}$/;

export const notifyExecutors: ExecutorRegistry = {
  "notify.telegram": {
    kind: "step",
    async run(context) {
      const config = context.config(telegramMessageConfigSchema);
      const token = requireResolved(config.botToken, "Telegram bot token").trim();
      if (!telegramToken.test(token))
        throw new NodeExecutionError("Telegram message needs a bot token");
      const chatId = config.chatId.trim();
      if (!chatId) throw new NodeExecutionError("Telegram message needs a chat id");
      const body = valueText(config.text).trim();
      if (!body) throw new NodeExecutionError("Telegram message text is empty");
      const response = await reach("Telegram", () =>
        context.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: body }),
          signal: providerSignal(),
        }),
      );
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
      const apiKey = requireResolved(config.apiKey, "Resend API key").trim();
      if (!apiKey.startsWith("re_")) throw new NodeExecutionError("Email needs a Resend API key");
      const to = config.to
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean);
      const from = config.from.trim();
      if (!from) throw new NodeExecutionError("Email needs a sender address");
      if (to.length === 0) throw new NodeExecutionError("Email needs at least one recipient");
      if (!config.subject.trim()) throw new NodeExecutionError("Email needs a subject");
      const response = await reach("Resend", () =>
        context.fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from,
            to,
            subject: config.subject,
            text: valueText(config.text),
          }),
          signal: providerSignal(),
        }),
      );
      const answer = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok)
        throw new NodeExecutionError(
          `Resend answered ${response.status}${answer.message ? `: ${answer.message}` : ""}`,
        );
      return { sent: { id: answer.id ?? null, to } };
    },
  },
};
