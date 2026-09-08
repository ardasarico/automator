import { Type, type Static } from "@sinclair/typebox";

export const telegramMessageConfigSchema = Type.Object({
  botToken: Type.String({
    default: "",
    secret: true,
    description: "Reference a secret, for example {{secrets.telegram_bot_token}}.",
  }),
  chatId: Type.String({ default: "", description: "A chat id, or @channel for public channels." }),
  text: Type.String({ default: "" }),
});
export type TelegramMessageConfig = Static<typeof telegramMessageConfigSchema>;

export const emailConfigSchema = Type.Object({
  apiKey: Type.String({
    default: "",
    secret: true,
    description: "A Resend API key, for example {{secrets.resend_api_key}}.",
  }),
  from: Type.String({ default: "", description: "A sender on a domain verified in Resend." }),
  to: Type.String({ default: "", description: "One or more addresses, separated by commas." }),
  subject: Type.String({ default: "" }),
  text: Type.String({ default: "" }),
});
export type EmailConfig = Static<typeof emailConfigSchema>;
