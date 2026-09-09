/**
 * Home creates the flow and the canvas writes it: the prompt itself travels between them in
 * session storage rather than the URL, which would cap it far below the 4,000 characters the
 * AI accepts. It is read once, so reloading the canvas does not send the prompt again.
 */
const key = "automator.pending-prompt";

export function storePendingPrompt(text: string): void {
  try {
    sessionStorage.setItem(key, text);
  } catch {
    /* Private windows and blocked site data leave the canvas with an empty AI panel. */
  }
}

export function takePendingPrompt(): string | null {
  try {
    const text = sessionStorage.getItem(key);
    if (text !== null) sessionStorage.removeItem(key);
    return text;
  } catch {
    return null;
  }
}
