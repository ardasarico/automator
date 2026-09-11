import { afterEach, describe, expect, test } from "bun:test";
import { captureNextPath, safeNextPath, signedInPath } from "./signed-in-path";

function useStorage(values: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(values));
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as Storage;
  return store;
}

function useLocation(href: string): { replaced: string[]; states: unknown[] } {
  const page = { replaced: [] as string[], states: [] as unknown[] };
  (globalThis as { window?: unknown }).window = {
    location: { href },
    history: {
      state: { __NA: true },
      replaceState: (state: unknown, _title: string, url: URL) => {
        page.states.push(state);
        page.replaced.push(url.toString());
      },
    },
  };
  return page;
}

afterEach(() => {
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  delete (globalThis as { window?: unknown }).window;
});

describe("the path a signed-out visitor asked for", () => {
  test("is kept when it is a path on this origin", () => {
    expect(safeNextPath("/marketplace/uniswap-swap")).toBe("/marketplace/uniswap-swap");
    expect(safeNextPath("/flows/abc?run=def")).toBe("/flows/abc?run=def");
    expect(safeNextPath("/data/t1/r1#top")).toBe("/data/t1/r1#top");
  });

  test("is dropped when absent or empty", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("   ")).toBeNull();
  });

  test("is dropped when it could leave the origin", () => {
    for (const value of [
      "https://evil.example/",
      "http://evil.example",
      "javascript:alert(1)",
      "//evil.example/",
      "/\\evil.example/",
      "/flows\\..\\evil",
      "evil.example",
      " //evil.example",
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  test("is dropped when it is a sign-in page itself", () => {
    for (const value of ["/login", "/login?next=%2Fflows", "/onboarding", "/onboarding/"]) {
      expect(safeNextPath(value)).toBeNull();
    }
    // Only the pages themselves: a route that merely starts with the word stays.
    expect(safeNextPath("/logins")).toBe("/logins");
  });
});

describe("the login page reading where the visitor was headed", () => {
  test("keeps a safe `next` and takes it off the URL", () => {
    const store = useStorage();
    const page = useLocation("https://app.example/login?next=%2Fmarketplace%2Fswap%3Ftab%3D1");
    captureNextPath();
    expect(store.get("automator.next-path")).toBe("/marketplace/swap?tab=1");
    expect(page.replaced).toEqual(["https://app.example/login"]);
    expect(page.states).toEqual([null]);
  });

  test("forgets an earlier path when the new one is unsafe", () => {
    const store = useStorage({ "automator.next-path": "/flows/abc" });
    useLocation("https://app.example/login?next=https%3A%2F%2Fevil.example");
    captureNextPath();
    expect(store.has("automator.next-path")).toBe(false);
  });

  test("leaves a stored path alone when the URL carries none", () => {
    // Google sign-in comes back to /login without the query; the stored path must survive.
    const store = useStorage({ "automator.next-path": "/flows/abc" });
    const page = useLocation("https://app.example/login?privy_oauth_state=x");
    captureNextPath();
    expect(store.get("automator.next-path")).toBe("/flows/abc");
    expect(page.replaced).toEqual([]);
  });
});

describe("where a finished sign-in lands", () => {
  test("Flows, as before, when nothing is waiting", () => {
    useStorage();
    expect(signedInPath()).toBe("/flows");
  });

  test("Home when the landing page handed over a prompt", () => {
    useStorage({ "automator.handoff-prompt": "Swap 100 USDC for ETH every Monday" });
    expect(signedInPath()).toBe("/");
  });

  test("the page the visitor asked for, once, when there is no prompt", () => {
    useStorage({ "automator.next-path": "/marketplace/swap" });
    expect(signedInPath()).toBe("/marketplace/swap");
  });

  test("the prompt wins over a stored path", () => {
    useStorage({
      "automator.handoff-prompt": "Swap 100 USDC",
      "automator.next-path": "/marketplace/swap",
    });
    expect(signedInPath()).toBe("/");
  });

  test("survives storage the browser refuses to open", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(signedInPath()).toBe("/flows");
  });
});
