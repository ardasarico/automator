"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders the combos registered with the hotkey registry so the interface can name them.
 * The keys only exist if a reader can find them, and nothing else in the builder says they do.
 */

const appleKeys: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  enter: "⏎",
};

const otherKeys: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
};

/** Formats a registry combo such as `mod+shift+z` for the platform the reader is on. */
export function formatShortcut(combo: string, apple: boolean): string {
  const keys = apple ? appleKeys : otherKeys;
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => keys[part] ?? (part.length === 1 ? part.toUpperCase() : part));
  return apple ? parts.join("") : parts.join("+");
}

const subscribe = () => () => {};
/* Rendered on the server and on the first client pass, so both agree before the check runs. */
const serverSnapshot = () => true;
const clientSnapshot = () => /mac|iphone|ipad/i.test(navigator.userAgent);

function useApplePlatform(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

/** The label for one combo, corrected to the reader's platform after mount. */
export function useShortcut(combo: string): string {
  return formatShortcut(combo, useApplePlatform());
}
