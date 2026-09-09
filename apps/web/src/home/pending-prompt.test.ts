import { afterEach, describe, expect, test } from "bun:test";
import { storePendingPrompt, takePendingPrompt } from "./pending-prompt";

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

afterEach(() => {
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
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
