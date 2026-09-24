import { SCORE_COLOR_BANDS, type TimeWindow } from "./constants";

/** Returns YYYY-MM-DD for the Monday of the week containing `date`. */
export function weekStartMonday(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateKey(d);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export type ColorBand = keyof typeof SCORE_COLOR_BANDS;

export function colorBandFor(score: number | null | undefined): ColorBand | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score <= SCORE_COLOR_BANDS.red.max) return "red";
  if (score <= SCORE_COLOR_BANDS.yellow.max) return "yellow";
  return "green";
}

export function colorFor(score: number | null | undefined): string {
  const band = colorBandFor(score);
  return band ? SCORE_COLOR_BANDS[band].color : "rgba(255,255,255,0.35)";
}

export function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Direction/label used for the trend arrow on the overall score card. */
export function trendDirection(
  current: number | null,
  previous: number | null
): { arrow: "up" | "down" | "flat" | "none"; delta: number | null } {
  if (current == null || previous == null) return { arrow: "none", delta: null };
  const delta = roundTo(current - previous, 1);
  if (delta > 0.5) return { arrow: "up", delta };
  if (delta < -0.5) return { arrow: "down", delta };
  return { arrow: "flat", delta };
}

/** Start/end (inclusive) Date bounds for a given time-window option. */
export function boundsForWindow(
  window: TimeWindow,
  today: Date = new Date()
): { start: Date; end: Date } {
  const y = today.getFullYear();
  const m = today.getMonth();

  switch (window) {
    case "this_month":
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
    case "last_month":
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
    case "3_months":
      return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 0) };
    case "6_months":
      return { start: new Date(y, m - 5, 1), end: new Date(y, m + 1, 0) };
    case "1_year":
      return { start: new Date(y, m - 11, 1), end: new Date(y, m + 1, 0) };
    case "all_time":
      return { start: new Date(1970, 0, 1), end: new Date(y, m + 1, 0) };
  }
}

/** The equal-length preceding window, used for the trend-arrow comparison. */
export function previousEqualWindow(
  window: TimeWindow,
  today: Date = new Date()
): { start: Date; end: Date } {
  const { start, end } = boundsForWindow(window, today);
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: prevStart, end: prevEnd };
}

/**
 * Every Monday (week_start) between start and end inclusive. Used to build
 * a complete weekly grid so a deleted/never-filled-in week renders as a real
 * gap in the trend chart instead of the line jumping straight to the next
 * point that exists.
 */
export function weeksInRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  let cursor = parseDateKey(weekStartMonday(start));
  const last = parseDateKey(weekStartMonday(end));
  while (cursor.getTime() <= last.getTime()) {
    out.push(toDateKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }
  return out;
}

/** Start/end (inclusive) Date bounds for one specific calendar month/year. */
export function boundsForMonth(year: number, month1to12: number): { start: Date; end: Date } {
  return { start: new Date(year, month1to12 - 1, 1), end: new Date(year, month1to12, 0) };
}
