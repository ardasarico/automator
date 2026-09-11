/**
 * Home creates the flow and the canvas writes it: the prompt itself travels between them in
 * session storage rather than the URL, which would cap it far below the 4,000 characters the
 * AI accepts. It is read once, so reloading the canvas does not send the prompt again.
 */
const key = "automator.pending-prompt";

/**
 * The landing page's box arrives as `?prompt=` on the workspace root. A visitor is usually
 * signed out, so the prompt has to outlive the login and onboarding pages in between: it is
 * kept under its own key, apart from the canvas handover, so a visitor who signs in and opens
 * a flow some other way does not find it sent to the model there.
 */
const handoffKey = "automator.handoff-prompt";

function read(name: string): string | null {
  try {
    return sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, text: string): void {
  try {
    sessionStorage.setItem(name, text);
  } catch {
    /* Private windows and blocked site data leave the canvas with an empty AI panel. */
  }
}

function take(name: string): string | null {
  try {
    const text = sessionStorage.getItem(name);
    if (text !== null) sessionStorage.removeItem(name);
    return text;
  } catch {
    return null;
  }
}

export function storePendingPrompt(text: string): void {
  write(key, text);
}

export function takePendingPrompt(): string | null {
  return take(key);
}

/**
 * Reads `?prompt=` off the current URL once and takes it out of the address, so a reload or a
 * shared link does not draft it again. Called by whichever page first sees the visitor: Home
 * when they are signed in, the login page otherwise.
 */
export function captureHandoffPrompt(): void {
  const url = new URL(window.location.href);
  const text = url.searchParams.get("prompt");
  if (text === null) return;
  url.searchParams.delete("prompt");
  /* A null state, not Next's own: with the router's entry reused, its patched replaceState
   * skips the sync and the next router commit would put the prompt back in the address. */
  window.history.replaceState(null, "", url);
  if (text.trim() !== "") write(handoffKey, text);
}

export function hasHandoffPrompt(): boolean {
  return read(handoffKey) !== null;
}

export function takeHandoffPrompt(): string | null {
  return take(handoffKey);
}
