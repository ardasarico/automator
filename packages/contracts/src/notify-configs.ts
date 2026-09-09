import { Type, type Static } from "@sinclair/typebox";

export const telegramMessageConfigSchema = Type.Object({
  botToken: Type.String({
    default: "",
    secret: true,
    title: "Bot token",
    description: "Reference a secret, for example {{secrets.telegram_bot_token}}.",
  }),
  chatId: Type.String({
    default: "",
    title: "Chat",
    description: "A chat id, or @channel for public channels.",
  }),
  text: Type.String({ default: "", title: "Message", description: "What to send." }),
});
export type TelegramMessageConfig = Static<typeof telegramMessageConfigSchema>;

export const emailConfigSchema = Type.Object({
  apiKey: Type.String({
    default: "",
    secret: true,
    title: "Resend API key",
    description: "A Resend API key, for example {{secrets.resend_api_key}}.",
  }),
  from: Type.String({ default: "", description: "A sender on a domain verified in Resend." }),
  to: Type.String({ default: "", description: "One or more addresses, separated by commas." }),
  subject: Type.String({ default: "", description: "The subject line." }),
  text: Type.String({ default: "", title: "Message", description: "The body of the email." }),
});
export type EmailConfig = Static<typeof emailConfigSchema>;
