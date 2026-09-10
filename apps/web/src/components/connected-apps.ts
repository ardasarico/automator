type NotificationChannel = {
  id: "discord" | "telegram" | "email";
  label: string;
  keyword: string;
  hint: string;
};

const notificationChannels: readonly NotificationChannel[] = [
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
  secretNames: string[];
};

export function detectChannels(secretNames: readonly string[]): ChannelStatus[] {
  return notificationChannels.map((channel) => {
    const matching = secretNames.filter((name) => name.includes(channel.keyword)).sort();
    return { ...channel, connected: matching.length > 0, secretNames: matching };
  });
}
