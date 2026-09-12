"use client";

import type React from "react";

/**
 * The first character of the app's name, as the bar's tile shows it. `Array.from` splits by code
 * point, so an emoji or an astral character arrives whole rather than as half a surrogate pair.
 */
export function monogram(name: string): string {
  return (Array.from(name.trim())[0] ?? "·").toUpperCase();
}

/**
 * The bar every mini-app host paints above the current screen: who the app is, and whether it is
 * working. It carries no controls — the screens own every action a visitor can take, and a control
 * here would sit ahead of them in the tab order for no gain.
 */
export function AppBar({ name, busy }: { name: string; busy: boolean }) {
  return (
    <div
      data-slot="mini-app-bar"
      className="flex-none border-b bg-background pt-[env(safe-area-inset-top)]"
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span
          aria-hidden="true"
          className="flex size-7 flex-none items-center justify-center rounded-2xl bg-muted text-caption font-medium text-muted-foreground"
        >
          {monogram(name)}
        </span>
        <span className="min-w-0 truncate text-label">{name}</span>
      </div>
      {/* The track holds its 2px whether or not it is running, so the screen never shifts. */}
      <div className="relative h-0.5 overflow-hidden" aria-hidden="true">
        {busy && (
          <span
            data-slot="mini-app-progress-bar"
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary"
          />
        )}
      </div>
    </div>
  );
}

/**
 * The animated wrapper around whichever view is current. Hosts key it per view, so React remounts
 * it on every change and the enter animation plays again.
 */
export function MiniAppView({ view, children }: { view: string; children: React.ReactNode }) {
  return (
    <div data-slot="mini-app-view" data-view={view} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
