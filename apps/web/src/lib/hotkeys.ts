"use client";

import { useEffect, useRef } from "react";

/**
 * One window `keydown` listener for the whole app.
 *
 * Scopes are a priority ladder rather than an explicit activation stack: when a combo has
 * handlers in more than one scope, only the handlers in the highest-priority scope run.
 * A dialog can therefore claim a combo simply by registering it, and the canvas or global
 * handler for the same combo stays silent until the dialog unmounts.
 */
export type HotkeyScope = "global" | "canvas" | "dialog";

const scopePriority: Record<HotkeyScope, number> = { global: 0, canvas: 1, dialog: 2 };

export type HotkeyOptions = {
  scope?: HotkeyScope;
  /** Fire even when the event comes from an input, textarea, select or contenteditable. */
  allowInEditable?: boolean;
};

/**
 * A combo is `+`-separated modifiers followed by a key, for example `mod+shift+s` or
 * `escape`. `mod` matches Command or Control, so one combo covers macOS and the rest.
 */
type ParsedCombo = { key: string; mod: boolean; shift: boolean; alt: boolean };

type Registration = {
  combo: ParsedCombo;
  scope: HotkeyScope;
  allowInEditable: boolean;
  handler: (event: KeyboardEvent) => void;
};

function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1) ?? "";
  const modifiers = parts.slice(0, -1);
  return {
    key,
    mod: modifiers.includes("mod"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
}

function matches(combo: ParsedCombo, event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === combo.key &&
    (event.metaKey || event.ctrlKey) === combo.mod &&
    event.shiftKey === combo.shift &&
    event.altKey === combo.alt
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=true]"));
}

const registrations = new Set<Registration>();
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  const editable = isEditable(event.target);
  const candidates = [...registrations].filter(
    (entry) => matches(entry.combo, event) && (entry.allowInEditable || !editable),
  );
  if (candidates.length === 0) return;
  const top = Math.max(...candidates.map((entry) => scopePriority[entry.scope]));
  for (const entry of candidates) {
    if (scopePriority[entry.scope] === top) entry.handler(event);
  }
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown);
  listening = true;
}

function stopListening() {
  if (!listening) return;
  window.removeEventListener("keydown", onKeyDown);
  listening = false;
}

/** Register a hotkey and get back the function that removes it. */
export function registerHotkey({
  combo,
  handler,
  scope = "global",
  allowInEditable = false,
}: HotkeyOptions & { combo: string; handler: (event: KeyboardEvent) => void }): () => void {
  const entry: Registration = { combo: parseCombo(combo), scope, allowInEditable, handler };
  registrations.add(entry);
  startListening();
  return () => {
    registrations.delete(entry);
    if (registrations.size === 0) stopListening();
  };
}

export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  {
    scope = "global",
    allowInEditable = false,
    enabled = true,
  }: HotkeyOptions & { enabled?: boolean } = {},
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return registerHotkey({
      combo,
      scope,
      allowInEditable,
      handler: (event) => handlerRef.current(event),
    });
  }, [combo, scope, allowInEditable, enabled]);
}
