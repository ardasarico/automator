"use client";

import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import Link from "next/link";
import { CopyButton } from "../components/copy-button";
import { publicApiUrl } from "../lib/api-url";
import {
  apiKeyPlaceholder,
  claudeCodeCommand,
  mcpClientConfig,
  mcpServerUrl,
} from "./mcp-snippets";

function Snippet({
  name,
  title,
  text,
  what,
  wrap,
}: {
  name: string;
  title: string;
  text: string;
  what: string;
  wrap?: boolean;
}) {
  return (
    <div data-snippet={name} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-label">{title}</h4>
        <CopyButton iconOnly variant="ghost" text={text} what={what} />
      </div>
      <pre
        className={`bg-muted rounded-md p-3 font-mono text-xs ${
          /* A command wraps so a narrow dialog shows all of it; JSON keeps its indentation and
             scrolls instead, because wrapped JSON is harder to read than scrolled JSON.
             `wrap-anywhere`, not `break-all`: break-all splits the URL mid-host, and a command
             a reader retypes should break between its words wherever it can. */
          wrap ? "whitespace-pre-wrap wrap-anywhere" : "overflow-x-auto"
        }`}
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

/**
 * How to reach these flows from an AI assistant.
 *
 * Written as a section rather than a dialog so the "Use as API" dialog can mount it under the
 * HTTP half; it carries no chrome and no state of its own beyond the copy buttons.
 */
export function McpSection({ apiUrl = publicApiUrl }: { apiUrl?: string }) {
  const url = mcpServerUrl(apiUrl);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mcp-section-title">
      <div>
        <h3 id="mcp-section-title" className="text-label">
          Model Context Protocol
        </h3>
        <p className="mt-1 text-caption text-muted-foreground text-pretty">
          Give an AI assistant one server and it can run your flows as tools. It is one server for
          the whole workspace, so every flow you publish as an API appears in it, this one included.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="mcp-server-url">Server URL</FieldLabel>
        {/* Field lays its children out with items-start, so a row must claim the width. */}
        <div className="flex w-full items-center gap-1">
          <Input
            id="mcp-server-url"
            readOnly
            value={url}
            className="min-w-0 flex-1 font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <CopyButton iconOnly variant="ghost" text={url} what="server URL" />
        </div>
        <FieldDescription>
          Authenticate with an API key from{" "}
          <Link href="/connections" className="underline underline-offset-2">
            Connections
          </Link>
          , and replace {apiKeyPlaceholder} below with it. A key can run every flow you have
          published, so treat it like a password.
        </FieldDescription>
      </Field>
      <Snippet
        name="claude-code"
        title="Claude Code"
        text={claudeCodeCommand(url)}
        what="command"
        wrap
      />
      <Snippet
        name="client-config"
        title="Cursor, Claude Desktop and other clients"
        text={mcpClientConfig(url)}
        what="configuration"
      />
    </section>
  );
}
