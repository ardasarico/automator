/**
 * Client-side UI preferences stored in cookies so the server can restore them on first render.
 * The server half lives in `preferences.server.ts`; keeping it separate stops `next/headers`
 * from being pulled into the client bundle by these constants.
 */

/** Sidebar open/collapsed state, read by `(workspace)/layout.tsx`. */
export const SIDEBAR_COOKIE = "workspace_sidebar";
/** Grid/table preference of the flow browser, read by `(workspace)/flows/page.tsx`. */
export const FLOWS_VIEW_COOKIE = "flows_view";
/** Set once the builder's getting-started checklist is dismissed; read by `(canvas)/flows/[id]`. */
export const BUILDER_CHECKLIST_COOKIE = "builder_checklist";

const DAY_IN_SECONDS = 24 * 60 * 60;

export function setPreferenceCookie(
  name: string,
  value: string,
  { maxAgeDays = 365 }: { maxAgeDays?: number } = {},
): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.round(maxAgeDays * DAY_IN_SECONDS);
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
