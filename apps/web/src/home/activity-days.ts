/**
 * The tape is read down a day at a time, so the rows carry a heading instead of repeating a date
 * on every line. Which day a run belongs to depends on where the reader is: the same instant is
 * Tuesday evening in New York and Wednesday morning in Istanbul, so the zone is always explicit.
 */

export type DatedRow = { id: string; at: string };

export type DayGroup<Row extends DatedRow> = { key: string; label: string; rows: Row[] };

const dayKeys = new Map<string, Intl.DateTimeFormat>();
const dayLabels = new Map<string, Intl.DateTimeFormat>();

function formatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const existing = cache.get(timeZone);
  if (existing) return existing;
  const made = new Intl.DateTimeFormat("en-CA", { timeZone, ...options });
  cache.set(timeZone, made);
  return made;
}

/** A sortable year-month-day in the reader's zone, which is what "the same day" means here. */
function dayKey(value: string, timeZone: string): string {
  return formatter(dayKeys, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(value),
  );
}

function dayLabel(key: string, timeZone: string, now: string): string {
  const today = dayKey(now, timeZone);
  if (key === today) return "Today";
  const yesterday = dayKey(new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString(), timeZone);
  if (key === yesterday) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return formatter(dayLabels, timeZone, { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12)),
  );
}

export function groupByDay<Row extends DatedRow>(
  rows: readonly Row[],
  { now, timeZone }: { now: string; timeZone: string },
): DayGroup<Row>[] {
  const groups: DayGroup<Row>[] = [];
  for (const row of rows) {
    const key = dayKey(row.at, timeZone);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, label: dayLabel(key, timeZone, now), rows: [row] });
  }
  return groups;
}
