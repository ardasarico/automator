/// <reference types="bun" />
import type { ApiKeySummary, SecretSummary } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { navigationModule } from "../../../auth/test-navigation";

// Base UI reads whether a DOM exists when it is first imported; registering first keeps the
// portals working whatever order the files in this directory run in.
GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
mock.module("next/navigation", () => navigationModule);
mock.module("../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));

const { createRoot } = await import("react-dom/client");
const { secretsStore } = await import("../../../builder/secrets-store");
const { ConnectionsBrowser } = await import("./connections-browser");

afterAll(() => GlobalRegistrator.unregister());

const ciKey: ApiKeySummary = {
  id: "key-1",
  name: "CI",
  prefix: "ak_Ab3dEf9",
  createdAt: "2026-09-09T10:00:00.000Z",
  lastUsedAt: "2026-09-10T09:00:00.000Z",
};

const discord: SecretSummary = {
  name: "discord_webhook",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

test("both sections render, each with its own heading", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[]} />);
  expect(html).toContain("Secrets");
  expect(html).toContain("Connected apps");
});

test("an empty secrets list explains what a secret is for", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[]} />);
  expect(html).toContain("No secrets yet");
});

test("a secret is listed as the template a node writes, never as a value", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[discord]} apiKeys={[]} />);
  expect(html).toContain("{{secrets.discord_webhook}}");
  expect(html).not.toContain('value=\\"');
});

test("a channel whose secret exists reads as connected, the others do not", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[discord]} apiKeys={[]} />);
  expect(html).toContain("Connected");
  expect(html).toContain("Not connected");
});

test("an unreachable list says so rather than claiming there are no secrets", () => {
  const html = renderToString(<ConnectionsBrowser secrets={null} apiKeys={[]} />);
  expect(html).toContain("Secrets could not load");
  expect(html).not.toContain("No secrets yet");
});

test("channel status is withheld when the secrets behind it could not be read", () => {
  const html = renderToString(<ConnectionsBrowser secrets={null} apiKeys={[]} />);
  expect(html).not.toContain("Not connected");
});

test("the API keys section says what a key is for", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[]} />);
  expect(html).toContain("API keys");
  expect(html).toContain("No API keys yet");
});

test("a key is listed by its name and visible head, and says when it was last used", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[ciKey]} />);
  expect(html).toContain("CI");
  expect(html).toContain("ak_Ab3dEf9");
  expect(html).toContain("Last used");
});

test("a key that has never been used says so rather than showing a date", () => {
  const { lastUsedAt: _unused, ...unused } = ciKey;
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[unused]} />);
  expect(html).toContain("Never used");
});

test("keys that could not be read are not reported as none", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={null} />);
  expect(html).toContain("API keys could not load");
  expect(html).not.toContain("No API keys yet");
});

test("section ids carry no spaces, so a heading with two words still labels its section", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[]} />);
  expect(html).toContain('aria-labelledby="connections-api-keys"');
  expect(html).toContain('id="connections-api-keys"');
  expect(html).toContain('aria-labelledby="connections-connected-apps"');
  expect(html).not.toContain("connections-API keys");
});

test("the secret name field does not offer autofill, the same as its value", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} apiKeys={[]} />);
  expect(html).toMatch(/<input[^>]*autocomplete="off"[^>]*placeholder="discord_webhook"/i);
});

test("dates are machine-readable stamps rendered in UTC on the server", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[discord]} apiKeys={[ciKey]} />);
  expect(html).toContain('<time dateTime="2026-09-08T10:00:00.000Z">Sep 8, 2026</time>');
  expect(html).toContain('<time dateTime="2026-09-10T09:00:00.000Z">Sep 10, 2026</time>');
});

/* Deleting and revoking ask first: the browser tests below click through the confirmation. */
const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method: string | undefined }>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  /* The store only writes for a signed-in account, the way the auth provider sets it up. */
  secretsStore.getState().setAccount("did:privy:test");
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    return String(url).includes("/secrets/")
      ? Response.json({ name: "discord_webhook" })
      : Response.json({ id: "key-1" });
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

async function mount(secrets: SecretSummary[], apiKeys: ApiKeySummary[]) {
  await act(async () => {
    root.render(<ConnectionsBrowser secrets={secrets} apiKeys={apiKeys} />);
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

const dialogTitle = () => document.querySelector("[data-slot=dialog-title]")?.textContent;

test("deleting a secret asks first and cancelling keeps it", async () => {
  await mount([discord], []);
  await act(async () => button("Delete secret discord_webhook").click());
  expect(dialogTitle()).toBe("Delete “discord_webhook”?");
  expect(document.body.textContent).toContain("Flows that read it will fail");
  await act(async () => button("Cancel").click());
  expect(calls).toEqual([]);
  expect(dialogTitle()).toBeUndefined();
});

test("confirming deletes the secret", async () => {
  await mount([discord], []);
  await act(async () => button("Delete secret discord_webhook").click());
  await act(async () => button("Delete secret").click());
  expect(calls).toEqual([{ url: "/api/secrets/discord_webhook", method: "DELETE" }]);
  expect(dialogTitle()).toBeUndefined();
});

test("revoking a key asks first and cancelling keeps it", async () => {
  await mount([], [ciKey]);
  await act(async () => button("Revoke API key CI").click());
  expect(dialogTitle()).toBe("Revoke “CI”?");
  expect(document.body.textContent).toContain("stops working immediately");
  await act(async () => button("Cancel").click());
  expect(calls).toEqual([]);
});

test("confirming revokes the key", async () => {
  await mount([], [ciKey]);
  await act(async () => button("Revoke API key CI").click());
  await act(async () => button("Revoke key").click());
  expect(calls).toEqual([{ url: "/api/api-keys/key-1", method: "DELETE" }]);
  expect(dialogTitle()).toBeUndefined();
});

test("a failed delete keeps the dialog open with its reason", async () => {
  globalThis.fetch = (async () =>
    Response.json({ error: "unavailable" }, { status: 503 })) as unknown as typeof fetch;
  await mount([discord], []);
  await act(async () => button("Delete secret discord_webhook").click());
  await act(async () => button("Delete secret").click());
  expect(dialogTitle()).toBe("Delete “discord_webhook”?");
  expect(document.querySelector("[role=alert]")?.textContent).toBe(
    "Secrets are unavailable right now. Try again shortly.",
  );
});
