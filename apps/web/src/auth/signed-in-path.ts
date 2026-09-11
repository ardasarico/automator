import { hasHandoffPrompt } from "../home/pending-prompt";

/**
 * A signed-out visitor's deep link reaches the login page as `?next=` (the redirect rule in
 * `next.config.ts` adds it, since the layouts that verify the session never see the URL). The
 * login form keeps it here, so it survives the code step and a Google round trip, and sign-in
 * or onboarding returns to it.
 */
const nextKey = "automator.next-path";

/**
 * Only a path on this origin is accepted: a scheme, a protocol-relative `//host`, the `/\host`
 * form browsers read the same way, or a sign-in page itself would turn the login page into an
 * open redirect or a loop.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.includes("\\")) return null;
  if (value.startsWith("//")) return null;
  if (/^\/(login|onboarding)(?:[/?#]|$)/.test(value)) return null;
  return value;
}

/** Reads `?next=` off the login page's URL once and keeps the path when it is safe to return to. */
export function captureNextPath(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get("next");
  if (value === null) return;
  url.searchParams.delete("next");
  window.history.replaceState(null, "", url);
  const next = safeNextPath(value);
  try {
    if (next === null) sessionStorage.removeItem(nextKey);
    else sessionStorage.setItem(nextKey, next);
  } catch {
    /* Blocked storage: the sign-in lands on Flows, as it did before. */
  }
}

function storedNextPath(): string | null {
  try {
    return safeNextPath(sessionStorage.getItem(nextKey));
  } catch {
    return null;
  }
}

/**
 * Where a finished sign-in lands. Home first when the landing page's prompt is waiting to be
 * drafted there, else the page the visitor asked for, else Flows, the workspace's working page.
 */
export function signedInPath(): string {
  if (hasHandoffPrompt()) return "/";
  return storedNextPath() ?? "/flows";
}
