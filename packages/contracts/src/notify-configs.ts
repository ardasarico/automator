import { Type, type Static } from "@sinclair/typebox";

/**
 * Config schemas for the notification nodes beyond Discord. Credentials are `secret` fields
 * meant to reference a stored secret (`{{secrets.<name>}}`): the marketplace blanks them and
 * the API resolves them only while it runs the flow.
 */

export const telegramMessageConfigSchema = Type.Object({
  /** The bot's token from @BotFather; reference a secret rather than pasting it. */
  botToken: Type.String({
    default: "",
    secret: true,
    description: "Reference a secret, for example {{secrets.telegram_bot_token}}.",
  }),
  /** A chat id or a public channel handle such as @announcements. */
  chatId: Type.String({ default: "", description: "A chat id, or @channel for public channels." }),
  text: Type.String({ default: "" }),
});
export type TelegramMessageConfig = Static<typeof telegramMessageConfigSchema>;

export const emailConfigSchema = Type.Object({
  /** A Resend API key; reference a secret rather than pasting it. */
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
