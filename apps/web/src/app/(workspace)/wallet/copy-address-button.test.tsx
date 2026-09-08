/// <reference types="bun" />
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { CopyAddressButton } = await import("./copy-address-button");

const address = "0x1111111111111111111111111111111111111111";
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

test("copies the address, confirms in a live region, and resets after two seconds", async () => {
  await act(async () => root.render(<CopyAddressButton address={address} />));
  const button = container.querySelector("button")!;
  const status = container.querySelector("[role=status]")!;
  expect(button.getAttribute("aria-label")).toBe("Copy address");
  expect(status.textContent).toBe("");

  await act(async () => button.click());
  expect(written).toEqual([address]);
  expect(button.getAttribute("aria-label")).toBe("Address copied");
  expect(status.textContent).toBe("Wallet address copied");

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2100));
  });
  expect(button.getAttribute("aria-label")).toBe("Copy address");
  expect(status.textContent).toBe("");
});

test("shows an accessible recovery message when the clipboard refuses and can retry", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => Promise.reject(new Error("denied")) },
  });
  await act(async () => root.render(<CopyAddressButton address={address} />));
  const button = container.querySelector("button")!;
  await act(async () => button.click());
  expect(button.getAttribute("aria-label")).toBe("Copy address");
  const status = container.querySelector("[role=status]")!;
  expect(status.textContent).toBe("Could not copy. Select and copy the wallet address.");
  expect(status.className).not.toContain("sr-only");
  expect(button.disabled).toBe(false);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  });
  await act(async () => button.click());
  expect(status.textContent).toBe("Wallet address copied");
  expect(button.getAttribute("aria-label")).toBe("Address copied");
});

test("shows recovery instructions when the clipboard API is unavailable", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  await act(async () => root.render(<CopyAddressButton address={address} />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("[role=status]")!.textContent).toContain("Could not copy.");
});

test("prevents another request while clipboard permission is pending", async () => {
  let finish!: () => void;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  await act(async () => root.render(<CopyAddressButton address={address} />));
  const button = container.querySelector("button")!;
  await act(async () => button.click());
  expect(button.disabled).toBe(true);
  expect(container.querySelector("[role=status]")!.textContent).toBe("Copying wallet address");
  await act(async () => button.click());
  expect(written).toEqual([address]);
  await act(async () => finish());
  expect(button.disabled).toBe(false);
});
