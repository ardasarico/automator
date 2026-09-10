"use client";

import { useEffect, useRef } from "react";

type HotkeyScope = "global" | "canvas" | "dialog";

const scopePriority: Record<HotkeyScope, number> = { global: 0, canvas: 1, dialog: 2 };

export type HotkeyOptions = {
  scope?: HotkeyScope;
  allowInEditable?: boolean;
};

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
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  for (let element: Element | null = target; element; element = element.parentElement) {
    const editable = element.getAttribute("contenteditable")?.toLowerCase();
    if (editable === "" || editable === "true" || editable === "plaintext-only") return true;
    if (editable === "false") return false;
  }
  return false;
}

const registrations = new Set<Registration>();
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return;
  const editable = isEditable(event.target);
  // Base UI portals may put a dialog's select/menu popup outside the dialog element.
  const dialogOpen = Boolean(
    document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]'),
  );
  const candidates = [...registrations].filter(
    (entry) => matches(entry.combo, event) && (entry.allowInEditable || !editable),
  );
  const activeCandidates = dialogOpen
    ? candidates.filter((entry) => entry.scope === "dialog")
    : candidates;
  if (activeCandidates.length === 0) {
    // Keep suspended app shortcuts such as Cmd/Ctrl+S from invoking browser actions.
    if (candidates.length > 0) event.preventDefault();
    return;
  }
  const top = Math.max(...activeCandidates.map((entry) => scopePriority[entry.scope]));
  for (const entry of activeCandidates) {
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
