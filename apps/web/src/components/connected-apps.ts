/**
 * Which notification channels the user has set up, read off their secret names: a channel
 * counts as connected when a secret whose name contains its keyword exists, since that is
 * what a Discord, Telegram or Email node references as `{{secrets.<name>}}`. There is no
 * OAuth; this is an honest view of the credentials the user stored.
 */
export type NotificationChannel = {
  id: "discord" | "telegram" | "email";
  label: string;
  /** The word a secret name must contain to count. */
  keyword: string;
  /** What the channel is used for, for the hint under a channel that is not connected. */
  hint: string;
};

export const notificationChannels: readonly NotificationChannel[] = [
  {
    id: "discord",
    label: "Discord",
    keyword: "discord",
    hint: "Store a webhook URL as a secret whose name contains “discord”.",
  },
  {
    id: "telegram",
    label: "Telegram",
    keyword: "telegram",
    hint: "Store a bot token as a secret whose name contains “telegram”.",
  },
  {
    id: "email",
    label: "Email (Resend)",
    keyword: "resend",
    hint: "Store a Resend API key as a secret whose name contains “resend”.",
  },
];

export type ChannelStatus = NotificationChannel & {
  connected: boolean;
  /** The secret names that make it connected, alphabetically. */
  secretNames: string[];
};

export function detectChannels(secretNames: readonly string[]): ChannelStatus[] {
  return notificationChannels.map((channel) => {
    const matching = secretNames.filter((name) => name.includes(channel.keyword)).sort();
    return { ...channel, connected: matching.length > 0, secretNames: matching };
  });
}
