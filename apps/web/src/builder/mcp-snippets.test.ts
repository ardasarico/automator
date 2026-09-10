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

  test("adds the server over HTTP with the key in an Authorization header", () => {
    expect(command).toBe(
      'claude mcp add --transport http automator https://api.automator.app/mcp --header "Authorization: Bearer YOUR_API_KEY"',
    );
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
