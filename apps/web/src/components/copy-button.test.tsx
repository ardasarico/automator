/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { CopyButton, copyToClipboard } = await import("./copy-button");

let container: HTMLDivElement;
let root: Root;
let written: string[];
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

beforeEach(() => {
  written = [];
  setClipboard({
    writeText: async (text: string) => {
      written.push(text);
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

afterAll(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  GlobalRegistrator.unregister();
});

async function click() {
  const button = container.querySelector("button");
  if (!button) throw new Error("no button rendered");
  await act(async () => {
    button.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

test("a labelled button copies its text and says so for two seconds", async () => {
  await act(async () => {
    root.render(<CopyButton text="0xabc" what="wallet address" />);
  });
  const button = container.querySelector("button");
  expect(button?.textContent).toContain("Copy");
  expect(button?.textContent).toContain("wallet address");
  await click();
  expect(written).toEqual(["0xabc"]);
  expect(container.querySelector("button")?.textContent).toContain("Copied");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Wallet address copied");
});

test("an icon-only button carries the wording in its accessible name", async () => {
  await act(async () => {
    root.render(<CopyButton text="hook" what="webhook URL" iconOnly />);
  });
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Copy webhook URL");
  await click();
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Copied webhook URL");
});

test("the text can be produced at click time", async () => {
  await act(async () => {
    root.render(<CopyButton text={() => "made-later"} what="link" />);
  });
  await click();
  expect(written).toEqual(["made-later"]);
});

test("a missing clipboard is reported in words rather than failing quietly", async () => {
  setClipboard(undefined);
  await act(async () => {
    root.render(<CopyButton text="x" what="API key" />);
  });
  await click();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Could not copy. Select and copy the API key instead.",
  );
  expect(container.querySelector("button")?.textContent).toContain("Copy");
});

test("copyToClipboard answers false when the API throws or is absent", async () => {
  setClipboard({
    writeText: async () => {
      throw new Error("denied");
    },
  });
  expect(await copyToClipboard("a")).toBe(false);
  setClipboard(undefined);
  expect(await copyToClipboard("a")).toBe(false);
  setClipboard({ writeText: async () => {} });
  expect(await copyToClipboard("a")).toBe(true);
});
