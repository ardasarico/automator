import { NodeExecutionError } from "./executor";

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
  if (!discordWebhook.test(webhookUrl))
    throw new NodeExecutionError("Discord message needs a Discord webhook URL");
  const text =
    typeof content === "string" ? content : content == null ? "" : JSON.stringify(content);
  if (!text.trim()) throw new NodeExecutionError("Discord message content is empty");
  const response = await fetcher(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, ...(username ? { username } : {}) }),
  });
  if (!response.ok) throw new NodeExecutionError(`Discord answered ${response.status}`);
  const message = (await response.json()) as { id?: string; channel_id?: string };
  return { messageId: message.id ?? null, channelId: message.channel_id ?? null };
}
