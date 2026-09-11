"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface ColumnPreferences {
  /** Column ids this viewer has hidden. A column the table no longer has is simply ignored. */
  hidden: readonly string[];
  /** Column id to pixel width. A column with no entry sizes itself to the default for its type. */
  widths: Readonly<Record<string, number>>;
}

/** The view a table has before anyone has said otherwise. One object, so it is a stable snapshot. */
const none: ColumnPreferences = { hidden: [], widths: {} };

export const minColumnWidth = 80;
export const maxColumnWidth = 800;

function storageKey(tableId: string): string {
  return `automator:data-columns:${tableId}`;
}

/** Anything the store cannot be trusted to hold is dropped rather than thrown at the reader. */
function parse(raw: string | null): ColumnPreferences {
  if (!raw) return none;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return none;
    const { hidden, widths } = value as { hidden?: unknown; widths?: unknown };
    return {
      hidden: Array.isArray(hidden)
        ? hidden.filter((id): id is string => typeof id === "string")
        : [],
      widths:
        typeof widths === "object" && widths !== null
          ? Object.fromEntries(
              Object.entries(widths as Record<string, unknown>).filter(
                (entry): entry is [string, number] =>
                  typeof entry[1] === "number" && Number.isFinite(entry[1]),
              ),
            )
          : {},
    };
  } catch {
    return none;
  }
}

function read(tableId: string): string | null {
  try {
    return localStorage.getItem(storageKey(tableId));
  } catch {
    // A browser with storage switched off keeps every column at its default width.
    return null;
  }
}

function write(tableId: string, value: ColumnPreferences): void {
  try {
    localStorage.setItem(storageKey(tableId), JSON.stringify(value));
  } catch {
    /* A preference that cannot be stored still applies to this view. */
  }
}

/*
 * `localStorage` is an external store, so the grid reads it as one: a cached snapshot per table
 * keeps the identity React needs between renders, and the server's snapshot is the default view,
 * which is what the server rendered. Another tab's change arrives through the storage event.
 */
const snapshots = new Map<string, ColumnPreferences>();
const listeners = new Set<() => void>();

function snapshot(tableId: string): ColumnPreferences {
  const known = snapshots.get(tableId);
  if (known) return known;
  const value = parse(read(tableId));
  snapshots.set(tableId, value);
  return value;
}

function announce(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && !event.key.startsWith("automator:data-columns:")) return;
  snapshots.clear();
  announce();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function commit(tableId: string, value: ColumnPreferences): void {
  snapshots.set(tableId, value);
  write(tableId, value);
  announce();
}

export interface ColumnPreferencesState extends ColumnPreferences {
  hide(columnId: string): void;
  show(columnId: string): void;
  showAll(): void;
  setWidth(columnId: string, width: number): void;
  clearWidth(columnId: string): void;
}

/**
 * Which columns this viewer keeps, and how wide. These are one person's view of a shared table
 * rather than part of it, so they live in `localStorage` and never reach the API.
 */
export function useColumnPreferences(tableId: string): ColumnPreferencesState {
  const preferences = useSyncExternalStore(
    subscribe,
    useCallback(() => snapshot(tableId), [tableId]),
    () => none,
  );

  return useMemo(
    () => ({
      ...preferences,
      hide: (columnId) =>
        commit(tableId, {
          ...preferences,
          hidden: [...new Set([...preferences.hidden, columnId])],
        }),
      show: (columnId) =>
        commit(tableId, {
          ...preferences,
          hidden: preferences.hidden.filter((id) => id !== columnId),
        }),
      showAll: () => commit(tableId, { ...preferences, hidden: [] }),
      setWidth: (columnId, width) =>
        commit(tableId, {
          ...preferences,
          widths: {
            ...preferences.widths,
            [columnId]: Math.round(Math.min(maxColumnWidth, Math.max(minColumnWidth, width))),
          },
        }),
      clearWidth: (columnId) => {
        const { [columnId]: _dropped, ...rest } = preferences.widths;
        commit(tableId, { ...preferences, widths: rest });
      },
    }),
    [preferences, tableId],
  );
}

/** Forgets every cached snapshot. Tests that write straight to the store call this first. */
export function forgetColumnPreferences(): void {
  snapshots.clear();
}
