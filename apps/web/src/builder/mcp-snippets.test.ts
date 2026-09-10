import { describe, expect, test } from "bun:test";
import {
  claudeCodeCommand,
  mcpClientConfig,
  mcpServerUrl,
  apiKeyPlaceholder,
} from "./mcp-snippets";

describe("mcpServerUrl", () => {
  test("puts the MCP endpoint on the API's public origin", () => {
    expect(mcpServerUrl("https://api.automator.app")).toBe("https://api.automator.app/mcp");
  });

  test("does not double the slash when the base already ends in one", () => {
    expect(mcpServerUrl("https://api.automator.app/")).toBe("https://api.automator.app/mcp");
  });
});

describe("claudeCodeCommand", () => {
  const command = claudeCodeCommand("https://api.automator.app/mcp");

  /*
   * Broken across lines because a single long command wrapped at its spaces in the dialog, where
   * "add --transport" read as "add--transport" to anyone retyping it. Joining the continuations
   * has to give back exactly the command it always was.
   */
  test("adds the server over HTTP with the key in an Authorization header", () => {
    expect(command.replace(/ \\\n\s*/g, " ")).toBe(
      'claude mcp add --transport http automator https://api.automator.app/mcp --header "Authorization: Bearer YOUR_API_KEY"',
    );
  });

  test("continues over several lines so no line has to wrap to be read", () => {
    const lines = command.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    /* Every line but the last ends in a continuation, so the whole thing pastes as one command. */
    expect(lines.slice(0, -1).every((line) => line.endsWith(" \\"))).toBe(true);
    expect(lines.every((line) => line.length <= 56)).toBe(true);
  });

  test("names the placeholder the section tells the reader to replace", () => {
    expect(command).toContain(apiKeyPlaceholder);
  });
});

describe("mcpClientConfig", () => {
  const config = mcpClientConfig("https://api.automator.app/mcp");

  test("is the JSON block a client's config file expects", () => {
    expect(JSON.parse(config)).toEqual({
      mcpServers: {
        automator: {
          type: "http",
          url: "https://api.automator.app/mcp",
          headers: { Authorization: `Bearer ${apiKeyPlaceholder}` },
        },
      },
    });
  });

  test("is indented, because a reader pastes it into a file they will read again", () => {
    expect(config).toContain('\n  "mcpServers"');
  });
});
