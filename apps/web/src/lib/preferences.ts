export const SIDEBAR_COOKIE = "workspace_sidebar";
export const FLOWS_VIEW_COOKIE = "flows_view";
export const DATA_RAIL_COOKIE = "data_rail";
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
