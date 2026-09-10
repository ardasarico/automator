/*
 * The two things a person has to paste somewhere else to reach their flows from an assistant:
 * one command for Claude Code, one JSON block for the clients that keep a config file.
 *
 * Keys are shown once, when they are created, so a snippet cannot carry a real one. It carries a
 * placeholder the surrounding copy names, which is also why the placeholder is exported.
 */

/** What a reader must replace with the key they created under Connections. */
export const apiKeyPlaceholder = "YOUR_API_KEY";

/** The MCP endpoint on the API's public origin. */
export function mcpServerUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/mcp`;
}

/** The one-line Claude Code command that registers the server. */
/*
 * One command, continued over several lines. As a single line it wrapped at its own spaces in
 * the dialog, so "add --transport" read as "add--transport" and anyone retyping it got that;
 * the arguments and their order are exactly what they were, only the line breaks are new.
 */
export function claudeCodeCommand(url: string): string {
  return [
    "claude mcp add --transport http \\",
    `  automator ${url} \\`,
    `  --header "Authorization: Bearer ${apiKeyPlaceholder}"`,
  ].join("\n");
}

/** The block Cursor and Claude Desktop style clients expect in their MCP config file. */
export function mcpClientConfig(url: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        automator: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${apiKeyPlaceholder}` },
        },
      },
    },
    null,
    2,
  );
}
