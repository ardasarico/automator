import { expect, test } from "bun:test";
import { parseNodeConfig, secretFields } from "./node-config";
import { emailConfigSchema, telegramMessageConfigSchema } from "./notify-configs";

test("notification configs default to empty strings and mark their credentials secret", () => {
  expect(parseNodeConfig(telegramMessageConfigSchema, {})).toEqual({
    botToken: "",
    chatId: "",
    text: "",
  });
  expect(parseNodeConfig(emailConfigSchema, {})).toEqual({
    apiKey: "",
    from: "",
    to: "",
    subject: "",
    text: "",
  });
  expect(secretFields(telegramMessageConfigSchema)).toEqual(["botToken"]);
  expect(secretFields(emailConfigSchema)).toEqual(["apiKey"]);
});
