/// <reference types="bun" />
import type { SecretSummary } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { navigationModule } from "../../../auth/test-navigation";

// Base UI reads whether a DOM exists when it is first imported; registering first keeps the
// portals working whatever order the files in this directory run in.
GlobalRegistrator.register();
mock.module("next/navigation", () => navigationModule);

const { ConnectionsBrowser } = await import("./connections-browser");

afterAll(() => GlobalRegistrator.unregister());

const discord: SecretSummary = {
  name: "discord_webhook",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

test("both sections render, each with its own heading", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} />);
  expect(html).toContain("Secrets");
  expect(html).toContain("Connected apps");
});

test("an empty secrets list explains what a secret is for", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} />);
  expect(html).toContain("No secrets yet");
});

test("a secret is listed as the template a node writes, never as a value", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[discord]} />);
  expect(html).toContain("{{secrets.discord_webhook}}");
  expect(html).not.toContain('value=\\"');
});

test("a channel whose secret exists reads as connected, the others do not", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[discord]} />);
  expect(html).toContain("Connected");
  expect(html).toContain("Not connected");
});

test("an unreachable list says so rather than claiming there are no secrets", () => {
  const html = renderToString(<ConnectionsBrowser secrets={null} />);
  expect(html).toContain("Secrets could not load");
  expect(html).not.toContain("No secrets yet");
});

test("channel status is withheld when the secrets behind it could not be read", () => {
  const html = renderToString(<ConnectionsBrowser secrets={null} />);
  expect(html).not.toContain("Not connected");
});
