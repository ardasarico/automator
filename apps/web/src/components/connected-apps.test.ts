import { describe, expect, test } from "bun:test";
import { detectChannels } from "./connected-apps";

describe("detectChannels", () => {
  test("a channel is connected when a secret name contains its keyword", () => {
    const channels = detectChannels(["team_discord", "resend_key", "openai"]);
    expect(channels.map((c) => [c.id, c.connected, c.secretNames])).toEqual([
      ["discord", true, ["team_discord"]],
      ["telegram", false, []],
      ["email", true, ["resend_key"]],
    ]);
  });

  test("lists every matching secret alphabetically", () => {
    expect(detectChannels(["discord_b", "discord_a"])[0]?.secretNames).toEqual([
      "discord_a",
      "discord_b",
    ]);
  });

  test("nothing is connected without secrets", () => {
    expect(detectChannels([]).every((c) => !c.connected)).toBe(true);
  });
});
