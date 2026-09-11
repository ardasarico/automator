import { afterEach, describe, expect, test } from "bun:test";
import {
  captureHandoffPrompt,
  hasHandoffPrompt,
  storePendingPrompt,
  takeHandoffPrompt,
  takePendingPrompt,
} from "./pending-prompt";

function useStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  } as Storage;
  (globalThis as { sessionStorage?: Storage }).sessionStorage = storage;
  return storage;
}

/** The page as `captureHandoffPrompt` sees it: an address and a history to rewrite it through. */
function useLocation(href: string): { href: string; replaced: string[]; states: unknown[] } {
  const page = { href, replaced: [] as string[], states: [] as unknown[] };
  (globalThis as { window?: unknown }).window = {
    location: { href },
    history: {
      /* What Next keeps on the entry; reusing it would make its router skip the rewrite. */
      state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] },
      replaceState: (state: unknown, _title: string, url: URL) => {
        page.states.push(state);
        page.replaced.push(url.toString());
        page.href = url.toString();
      },
    },
  };
  return page;
}

afterEach(() => {
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  delete (globalThis as { window?: unknown }).window;
});

describe("the prompt handed from Home to the canvas", () => {
  test("is read once, so a reload does not send it again", () => {
    useStorage();
    storePendingPrompt("Swap 100 USDC for ETH every Monday");
    expect(takePendingPrompt()).toBe("Swap 100 USDC for ETH every Monday");
    expect(takePendingPrompt()).toBeNull();
  });

  test("is absent when nothing was handed over", () => {
    useStorage();
    expect(takePendingPrompt()).toBeNull();
  });

  test("survives storage the browser refuses to open", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    } as unknown as Storage;
    expect(() => storePendingPrompt("anything")).not.toThrow();
    expect(takePendingPrompt()).toBeNull();
  });
});

describe("the prompt handed from the landing page", () => {
  test("is taken off the URL once and kept for Home", () => {
    useStorage();
    const page = useLocation("https://app.example/login?prompt=Swap%20100%20USDC&draft");
    captureHandoffPrompt();
    expect(page.replaced).toEqual(["https://app.example/login?draft="]);
    // Written with a fresh state, not the router's own, so the rewrite is one Next honours.
    expect(page.states).toEqual([null]);
    expect(hasHandoffPrompt()).toBe(true);
    expect(takeHandoffPrompt()).toBe("Swap 100 USDC");
    // Read once: the box gets it, the next visit to Home does not.
    expect(hasHandoffPrompt()).toBe(false);
    expect(takeHandoffPrompt()).toBeNull();
  });

  test("leaves a URL without a prompt alone", () => {
    useStorage();
    const page = useLocation("https://app.example/?draft");
    captureHandoffPrompt();
    expect(page.replaced).toEqual([]);
    expect(hasHandoffPrompt()).toBe(false);
  });

  test("drops a blank prompt but still cleans the URL", () => {
    useStorage();
    const page = useLocation("https://app.example/?prompt=%20%20");
    captureHandoffPrompt();
    expect(page.replaced).toEqual(["https://app.example/"]);
    expect(hasHandoffPrompt()).toBe(false);
  });

  test("keeps the canvas handover apart from the landing handover", () => {
    useStorage();
    useLocation("https://app.example/?prompt=From%20the%20landing");
    captureHandoffPrompt();
    expect(takePendingPrompt()).toBeNull();
    expect(takeHandoffPrompt()).toBe("From the landing");
  });

  test("survives storage the browser refuses to open", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    } as unknown as Storage;
    useLocation("https://app.example/?prompt=anything");
    expect(() => captureHandoffPrompt()).not.toThrow();
    expect(hasHandoffPrompt()).toBe(false);
    expect(takeHandoffPrompt()).toBeNull();
  });
});
