/// <reference types="bun" />
import type { AccountUsage } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const auth = await import("../../../auth/provider");
const accessToken = await import("../../../auth/access-token");
const { SettingsBrowser } = await import("./settings-browser");

const usage: AccountUsage = {
  flows: 4,
  activeFlows: 2,
  runsLast30Days: { manual: 1, webhook: 2, schedule: 3, miniapp: 4, event: 5, watch: 6, api: 7 },
  secrets: 1,
  listings: 0,
  since: "2026-08-09T00:00:00.000Z",
};
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;
let token: () => Promise<string | null>;
let respond: (url: string) => Response;
let calls: string[];
let restore: Array<() => void>;
let walletAddress: string | null;
let written: string[];

beforeEach(() => {
  token = async () => "token";
  walletAddress = null;
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text);
      },
    },
  });
  respond = () => Response.json(usage);
  calls = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
  const tokenSpy = spyOn(accessToken, "useAccessToken").mockReturnValue(() => token());
  const authSpy = spyOn(auth, "useAuthSession").mockImplementation(() => ({
    user: { id: "did:privy:test", name: "Test", username: "test_user", walletAddress },
    pending: false,
    error: null,
    refresh: async () => {
      throw new Error("Unused");
    },
    saveProfile: async () => {
      throw new Error("Unused");
    },
    logout: async () => {},
  }));
  restore = [() => tokenSpy.mockRestore(), () => authSpy.mockRestore()];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  for (const reset of restore) reset();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SettingsBrowser />);
  });
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

test("the three sections are headings on one page, and Preferences points at Connections", async () => {
  await mount();
  const headings = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent?.trim());
  expect(headings).toEqual(["Preferences", "Usage", "Account"]);
  const link = document.querySelector<HTMLAnchorElement>('a[href="/connections"]');
  expect(link?.textContent).toContain("Open connections");
  /* The page reads usage and nothing else; secrets have their own page. */
  expect(calls).toEqual(["/api/account/usage"]);
  expect(document.body.textContent).toContain("@test_user");
});

test("usage can recover in place and includes watch runs in its total", async () => {
  respond = () => Response.json({ error: "unavailable" }, { status: 503 });
  await mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Usage is unavailable");

  respond = () => Response.json(usage);
  await click("Retry");
  expect(calls).toEqual(["/api/account/usage", "/api/account/usage"]);
  expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
  /* The breakdown names each trigger the way the Runs page does. */
  expect(document.body.textContent).toContain(
    "1 Simulate · 2 Webhook · 3 Schedule · 4 Mini-app · 5 Onchain event · 6 Watch · 7 API call",
  );
  const runRow = Array.from(document.querySelectorAll("dt")).find(
    (element) => element.textContent === "Runs in the last 30 days",
  )?.parentElement?.parentElement;
  expect(runRow?.lastElementChild?.textContent).toBe("28");
});

test("the usage window starts on a calendar date written like every other date", async () => {
  await mount();
  const since = document.querySelector('time[datetime="2026-08-09T00:00:00.000Z"]');
  /* The day depends on the reader's zone, the wording and the year do not. */
  expect(since?.textContent).toMatch(/^Aug [89], 2026$/);
  expect(document.body.textContent).toContain("Runs are counted since Aug");
});

test("the wallet address is copied with the shared copy control", async () => {
  walletAddress = "0x1111111111111111111111111111111111111111";
  await mount();
  await click("Copy wallet address");
  expect(written).toEqual([walletAddress]);
  expect(document.body.textContent).toContain("Copied wallet address");
});
