/** The workspace lives on its own host, so every way into it is an absolute URL, not a route. */
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.automator.ardasari.co";

export function draftUrl(prompt: string): string {
  return `${appUrl}/?prompt=${encodeURIComponent(prompt)}`;
}
