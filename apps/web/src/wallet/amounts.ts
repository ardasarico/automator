/**
 * Chain balances arrive as exact decimal strings, so `0.062999769144958985 ETH` is what a raw
 * render prints. These format one for reading and keep the exact string for the title attribute.
 */

/* Whole units read better with a fixed tail; dust needs significant digits or it rounds to 0. */
const wholeFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 4 });
const smallFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });

export function formatAmount(value: string): string {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) return value;
  if (parsed === 0) return "0";
  const format = Math.abs(parsed) >= 1 ? wholeFormat : smallFormat;
  const shown = format.format(parsed);
  /* Never claim an empty wallet: dust below the smallest shown digit keeps a threshold. */
  return Number(shown.replace(/,/g, "")) === 0 ? "<0.0001" : shown;
}

/** The exact value, for a title attribute, only when formatting actually dropped digits. */
export function exactAmount(value: string, formatted: string): string | undefined {
  return formatted.replace(/,/g, "") === value.trim() ? undefined : value;
}
