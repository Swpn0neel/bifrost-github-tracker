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

/**
 * Where the period starting on `start` would end if the rest of it kept the pace of its whole days so far.
 * `days` must end today; today is still being counted, so it is left out of the pace, and the
 * projection never drops below what is already in. A metric with an unknown day gets no projection,
 * and neither does a period before its first whole day is over or one that began before the data.
 */
export function projectPeriod(days: TrendRow[], start: string, group: TrendGroup): Partial<Record<TrendMetric, number>> {
  const firstDay = days[0]?.date;
  if (!firstDay || start < firstDay) return {};
  const inPeriod = days.slice(daysBetween(firstDay, start));
  const whole = inPeriod.slice(0, -1);
  if (whole.length === 0) return {};
  const length = daysBetween(start, periodEnd(start, group)) + 1;
  const out: Partial<Record<TrendMetric, number>> = {};
  for (const m of TREND_METRICS) {
    if (inPeriod.some((r) => r[m] === null)) continue;
    const wholeTotal = whole.reduce((acc, r) => acc + (r[m] as number), 0);
    const soFar = wholeTotal + (inPeriod[inPeriod.length - 1][m] as number);
    out[m] = Math.max(soFar, Math.round((wholeTotal / whole.length) * length));
  }
  return out;
}

export interface TrendWindow {
  rows: TrendRow[];
  /** The days actually covered, after widening to whole periods and clamping to the data. */
  from: string;
  to: string;
}

/** Per-month values ("YYYY-MM") from an outside source, for months whose days are not all known. */
export type MonthlyFill = Record<string, Partial<Record<TrendMetric, number>>>;

/** First day the chart can show: the first day row, or for the month grouping an earlier month the outside source covers. Empty when there is nothing. */
export function trendDataStart(days: TrendRow[], monthly: MonthlyFill, group: TrendGroup): string {
  const firstDay = days[0]?.date ?? "";
  if (group !== "month") return firstDay;
  const firstMonth = Object.keys(monthly).sort()[0];
  const monthDay = firstMonth ? `${firstMonth}-01` : "";
  if (!firstDay) return monthDay;
  return monthDay && monthDay < firstDay ? monthDay : firstDay;
}

/**
 * Groups a contiguous run of days (oldest first, one row per day) into periods.
 * The requested range is widened outwards to whole periods, so the only period that
 * can be incomplete is the one the data ends in.
 *
 * A period with an unknown day is unknown as a whole: a sum over only the known days
 * would pass for the full period. `monthly` fills such months in the month grouping,
 * and lets that grouping reach back to months before the first day row.
 */
export function trendWindow(days: TrendRow[], from: string, to: string, group: TrendGroup, monthly: MonthlyFill = {}): TrendWindow {
  const first = trendDataStart(days, monthly, group);
  const last = days.length ? days[days.length - 1].date : first ? periodEnd(`${Object.keys(monthly).sort().at(-1)}-01`, "month") : "";
  if (!first || !last) return { rows: [], from, to };
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  const lo = clamp(periodStart(clamp(from), group));
  const hi = clamp(periodEnd(clamp(to), group));
  if (lo > hi) return { rows: [], from: lo, to: hi };

  // A day before the first row does not exist (the period is a partial sum); one inside the run that has no row is unknown.
  const firstDay = days[0]?.date ?? "";
  const dayAt = (d: string): TrendRow | undefined => {
    if (!firstDay || d < firstDay) return undefined;
    return days[daysBetween(firstDay, d)];
  };

  const rows: TrendRow[] = [];
  for (let p = periodStart(lo, group); p <= hi; p = addDays(periodEnd(p, group), 1)) {
    const row: TrendRow = { date: p, stars: 0, forks: 0, issues_opened: 0, issues_closed: 0, prs_opened: 0, prs_merged: 0, commits: 0 };
    const fill = group === "month" ? monthly[p.slice(0, 7)] : undefined;
    const unknown = new Set<TrendMetric>();
    let existing = 0;
    const end = periodEnd(p, group) < hi ? periodEnd(p, group) : hi;
    for (let d = p < lo ? lo : p; d <= end; d = addDays(d, 1)) {
      if (!firstDay || d < firstDay) {
        // Before the first row nothing was recorded: the period is a partial sum, unless
        // the outside source has the whole month, which then beats the partial sum.
        for (const m of TREND_METRICS) if (fill?.[m] !== undefined) unknown.add(m);
        continue;
      }
      existing++;
      const day = dayAt(d);
      for (const m of TREND_METRICS) {
        const v = day ? day[m] : null;
        if (v === null) unknown.add(m);
        row[m] = unknown.has(m) ? null : (row[m] ?? 0) + (v ?? 0);
      }
    }
    for (const m of TREND_METRICS) {
      if (existing === 0 || unknown.has(m)) row[m] = fill?.[m] ?? null;
    }
    rows.push(row);
  }
  return { rows, from: lo, to: hi };
}
