const relative = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" });

const steps = [
  { unit: "second" as const, ms: 1000, limit: 60 },
  { unit: "minute" as const, ms: 60_000, limit: 60 },
  { unit: "hour" as const, ms: 3_600_000, limit: 24 },
  { unit: "day" as const, ms: 86_400_000, limit: 7 },
  { unit: "week" as const, ms: 604_800_000, limit: 5 },
  { unit: "month" as const, ms: 2_629_800_000, limit: 12 },
];

/**
 * How long ago something happened, in the shortest unit that still says it ("3h ago",
 * "2 days ago"). A list carries many of these, so they stay narrow.
 */
export function relativeTime(value: string, now = Date.now()): string {
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return "";
  const elapsed = now - stamp;
  if (Math.abs(elapsed) < 45_000) return "just now";
  for (const step of steps) {
    const count = elapsed / step.ms;
    if (Math.abs(count) < step.limit) return relative.format(-Math.round(count), step.unit);
  }
  return relative.format(-Math.round(elapsed / 31_557_600_000), "year");
}
