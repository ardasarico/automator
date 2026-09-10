/// <reference types="bun" />
import type { AccountUsage } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const auth = await import("../auth/provider");
const accessToken = await import("../auth/access-token");
const { SettingsDialog } = await import("./settings-dialog");

const usage: AccountUsage = {
  flows: 4,
  activeFlows: 2,
  runsLast30Days: { manual: 1, webhook: 2, schedule: 3, miniapp: 4, event: 5, watch: 6, api: 7 },
  secrets: 1,
  listings: 0,
  since: "2026-08-09T00:00:00.000Z",
};
const originalFetch = globalThis.fetch;
const finalFocus = createRef<HTMLButtonElement>();
let container: HTMLDivElement;
let root: Root;
let token: () => Promise<string | null>;
let respond: (url: string) => Response;
let calls: string[];
let restore: Array<() => void>;

beforeEach(() => {
  token = async () => "token";
  respond = () => Response.json(usage);
  calls = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
  const tokenSpy = spyOn(accessToken, "useAccessToken").mockReturnValue(() => token());
  const authSpy = spyOn(auth, "useAuthSession").mockReturnValue({
    user: { id: "did:privy:test", name: "Test", username: "test_user", walletAddress: null },
    pending: false,
    error: null,
    refresh: async () => {
      throw new Error("Unused");
    },
    saveProfile: async () => {
      throw new Error("Unused");
    },
    logout: async () => {},
  });
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

async function mount(section?: "Usage") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SettingsDialog open onOpenChange={() => {}} finalFocus={finalFocus} />);
  });
  if (section) await click(section);
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

test("secrets and connected apps are a page, which Preferences points at", async () => {
  await mount();
  const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) =>
    tab.textContent?.trim(),
  );
  expect(tabs).toEqual(["Preferences", "Usage", "Account"]);
  const link = document.querySelector<HTMLAnchorElement>('a[href="/connections"]');
  expect(link?.textContent).toContain("Open connections");
  /* The dialog no longer reads secrets to draw a status, so opening it asks for nothing. */
  expect(calls).toEqual([]);
});

test("usage can recover in place and includes watch runs in its total", async () => {
  respond = () => Response.json({ error: "unavailable" }, { status: 503 });
  await mount("Usage");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Usage is unavailable");

  respond = () => Response.json(usage);
  await click("Retry");
  expect(calls).toEqual(["/api/account/usage", "/api/account/usage"]);
  expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
  expect(document.body.textContent).toContain("6 watch");
  const runRow = Array.from(document.querySelectorAll("dt")).find(
    (element) => element.textContent === "Runs in the last 30 days",
  )?.parentElement?.parentElement;
  expect(runRow?.lastElementChild?.textContent).toBe("28");
});
