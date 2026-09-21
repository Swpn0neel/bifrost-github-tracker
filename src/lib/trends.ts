import type { DailyPoint } from "./queries";

export const TREND_METRICS = ["stars", "forks", "issues_opened", "issues_closed", "prs_opened", "prs_merged", "commits"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

/** Activity in one period (an IST day or month). `null` means the value is unknown, not zero. */
export type TrendRow = { date: string } & Record<TrendMetric, number | null>;

/**
 * Per-day activity. Without star events a day's star gain is the change between two
 * daily snapshots, so it is only known when that day and the one before both have one.
 */
export function dailyTrend(points: DailyPoint[], starEvents: boolean): TrendRow[] {
  return points.map((p, i) => {
    const prev = points[i - 1];
    const starsKnown = starEvents || (p.source === "snapshot" && prev?.source === "snapshot");
    return {
      date: p.date,
      stars: starsKnown ? p.new_stars : null,
      forks: p.new_forks,
      issues_opened: p.issues_opened,
      issues_closed: p.issues_closed,
      prs_opened: p.prs_opened,
      prs_merged: p.prs_merged,
      commits: p.commits,
    };
  });
}

/** Rolls days up into calendar months ("YYYY-MM"), dropping the empty months before the repo had any activity. */
export function monthlyTrend(days: TrendRow[]): TrendRow[] {
  const months = new Map<string, TrendRow>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    let row = months.get(key);
    if (!row) {
      row = { date: key, stars: null, forks: 0, issues_opened: 0, issues_closed: 0, prs_opened: 0, prs_merged: 0, commits: 0 };
      months.set(key, row);
    }
    for (const m of TREND_METRICS) {
      const v = day[m];
      if (v !== null) row[m] = (row[m] ?? 0) + v;
    }
  }
  const rows = [...months.values()];
  const firstActive = rows.findIndex((r) => TREND_METRICS.some((m) => (r[m] ?? 0) > 0));
  return firstActive === -1 ? rows : rows.slice(firstActive);
}
