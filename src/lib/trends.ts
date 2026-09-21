import type { DailyPoint } from "./queries";
import { addDays, daysBetween, monthStart, weekday } from "./time";

export const TREND_METRICS = ["stars", "forks", "issues_opened", "issues_closed", "prs_opened", "prs_merged", "commits"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

/** Activity in one period. `date` is the period's first day; `null` means the value is unknown, not zero. */
export type TrendRow = { date: string } & Record<TrendMetric, number | null>;

export const TREND_GROUPS = ["day", "week", "month"] as const;
export type TrendGroup = (typeof TREND_GROUPS)[number];

/** Per-day activity. A day's star gain is left unknown where nothing measured or estimated it. */
export function dailyTrend(points: DailyPoint[]): TrendRow[] {
  return points.map((p) => {
    return {
      date: p.date,
      stars: p.new_stars_known ? p.new_stars : null,
      forks: p.new_forks,
      issues_opened: p.issues_opened,
      issues_closed: p.issues_closed,
      prs_opened: p.prs_opened,
      prs_merged: p.prs_merged,
      commits: p.commits,
    };
  });
}

/** First day of the period `date` falls in. Weeks start on Monday. */
export function periodStart(date: string, group: TrendGroup): string {
  if (group === "day") return date;
  if (group === "week") return addDays(date, -((weekday(date) + 6) % 7));
  return monthStart(date);
}

/** Last day of the period `date` falls in. */
export function periodEnd(date: string, group: TrendGroup): string {
  if (group === "day") return date;
  if (group === "week") return addDays(periodStart(date, "week"), 6);
  return addDays(monthStart(date, 1), -1);
}

export interface TrendWindow {
  rows: TrendRow[];
  /** The days actually covered, after widening to whole periods and clamping to the data. */
  from: string;
  to: string;
}

/**
 * Groups a contiguous run of days (oldest first, one row per day) into periods.
 * The requested range is widened outwards to whole periods, so the only period that
 * can be incomplete is the one the data ends in.
 *
 * A period with an unknown day is unknown as a whole: a sum over only the known days
 * would pass for the full period. `monthlyStars` ("YYYY-MM" -> gain) fills such months
 * in the month grouping.
 */
export function trendWindow(days: TrendRow[], from: string, to: string, group: TrendGroup, monthlyStars: Record<string, number> = {}): TrendWindow {
  if (days.length === 0) return { rows: [], from, to };
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  const lo = clamp(periodStart(clamp(from), group));
  const hi = clamp(periodEnd(clamp(to), group));
  if (lo > hi) return { rows: [], from: lo, to: hi };

  const rows: TrendRow[] = [];
  let unknown = new Set<TrendMetric>();
  for (const day of days.slice(daysBetween(first, lo), daysBetween(first, hi) + 1)) {
    const key = periodStart(day.date, group);
    let row = rows[rows.length - 1];
    if (!row || row.date !== key) {
      row = { date: key, stars: 0, forks: 0, issues_opened: 0, issues_closed: 0, prs_opened: 0, prs_merged: 0, commits: 0 };
      rows.push(row);
      unknown = new Set();
    }
    for (const m of TREND_METRICS) {
      const v = day[m];
      if (v === null) unknown.add(m);
      row[m] = unknown.has(m) ? null : (row[m] ?? 0) + (v ?? 0);
    }
  }
  if (group === "month") {
    for (const row of rows) if (row.stars === null) row.stars = monthlyStars[row.date.slice(0, 7)] ?? null;
  }
  return { rows, from: lo, to: hi };
}
