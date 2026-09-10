/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { McpSection } = await import("./mcp-section");

const apiUrl = "https://api.automator.app";
let container: HTMLDivElement;
let root: Root;
let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text);
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => GlobalRegistrator.unregister());

const render = () => act(async () => root.render(<McpSection apiUrl={apiUrl} />));
const snippet = (name: string) =>
  container.querySelector(`[data-snippet="${name}"] code`)?.textContent;

test("shows the MCP endpoint on the API's public origin", async () => {
  await render();
  const field = container.querySelector<HTMLInputElement>("input[readonly]");
  expect(field?.value).toBe("https://api.automator.app/mcp");
});

test("shows the Claude Code command with the server URL in it", async () => {
  await render();
  expect(snippet("claude-code")).toBe(
    'claude mcp add --transport http automator https://api.automator.app/mcp --header "Authorization: Bearer YOUR_API_KEY"',
  );
});

test("shows a config block for clients that keep one in a file", async () => {
  await render();
  expect(JSON.parse(snippet("client-config") ?? "{}")).toEqual({
    mcpServers: {
      automator: {
        type: "http",
        url: "https://api.automator.app/mcp",
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      },
    },
  });
});

test("sends the reader to Connections for the key the snippets leave blank", async () => {
  await render();
  const link = container.querySelector<HTMLAnchorElement>('a[href="/connections"]');
  expect(link).not.toBeNull();
  expect(container.textContent).toContain("YOUR_API_KEY");
});

test("says the server carries every published flow, not only this one", async () => {
  await render();
  expect(container.textContent).toContain("every flow you publish");
});

test("copies a snippet to the clipboard", async () => {
  await render();
  const button = container.querySelector<HTMLButtonElement>('[data-snippet="claude-code"] button')!;
  await act(async () => button.click());
  expect(written).toEqual([
    'claude mcp add --transport http automator https://api.automator.app/mcp --header "Authorization: Bearer YOUR_API_KEY"',
  ]);
  expect(button.getAttribute("aria-label")).toBe("Command copied");
});
