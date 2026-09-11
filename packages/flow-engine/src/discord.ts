import { NodeExecutionError } from "./executor";
import { valueText } from "./template";
import { providerSignal, reach, requireResolved } from "./transport";

const discordWebhook = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export interface DiscordDelivery {
  messageId: string | null;
  channelId: string | null;
}

export async function postDiscordMessage(
  fetcher: typeof fetch,
  webhookUrl: string,
  content: unknown,
  username = "",
): Promise<DiscordDelivery> {
  const url = requireResolved(webhookUrl, "Discord webhook URL").trim();
  if (!discordWebhook.test(url))
    throw new NodeExecutionError("Discord message needs a Discord webhook URL");
  const text = valueText(content);
  if (!text.trim()) throw new NodeExecutionError("Discord message content is empty");
  const response = await reach("Discord", () =>
    fetcher(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, ...(username ? { username } : {}) }),
      signal: providerSignal(),
    }),
  );
  const message = (await response.json().catch(() => ({}))) as {
    id?: string;
    channel_id?: string;
    message?: string;
  };
  if (!response.ok)
    throw new NodeExecutionError(
      `Discord answered ${response.status}${message.message ? `: ${message.message}` : ""}`,
    );
  return { messageId: message.id ?? null, channelId: message.channel_id ?? null };
}
