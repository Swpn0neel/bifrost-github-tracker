// Data for the Compare page: the repositories tracked alongside the primary one,
// their headline readings, and a per-day series in one shape for every repo,
// the primary included. Compared repos have snapshots and an outside source
// only, so their daily activity is the change between day-close readings.
import { query, queryOne } from "./db";
import { env } from "./env";
import { dailySeries, dataStartDate, externalMonthlyStars, firstSnapshot, latestSnapshot, type SnapshotRow } from "./queries";
import { addDays, type Slot } from "./time";
import type { MonthlyFill, TrendRow } from "./trends";

// ---------------------------------------------------------------------------
// Tracked repositories
// ---------------------------------------------------------------------------

export interface TrackedRepo {
  id: number;
  full_name: string;
  github_id: number | null;
  description: string | null;
  homepage: string | null;
  language: string | null;
  repo_created_at: Date | null;
  trendshift_id: number | null;
  added_at: Date;
  removed_at: Date | null;
}

const REPO_COLS = "id, full_name, github_id, description, homepage, language, repo_created_at, trendshift_id, added_at, removed_at";

/** Repos on the Compare page, oldest first. */
export function listTrackedRepos(): Promise<TrackedRepo[]> {
  return query<TrackedRepo>(`SELECT ${REPO_COLS} FROM tracked_repos WHERE removed_at IS NULL ORDER BY id`);
}

export function findTrackedRepo(fullName: string, { includeRemoved = false } = {}): Promise<TrackedRepo | null> {
  return queryOne<TrackedRepo>(
    `SELECT ${REPO_COLS} FROM tracked_repos WHERE lower(full_name) = lower($1) ${includeRemoved ? "" : "AND removed_at IS NULL"}`,
    [fullName],
  );
}

/** Add a repo, or bring back one that was removed. Returns the row and whether it is new to the table. */
export async function upsertTrackedRepo(fullName: string): Promise<{ repo: TrackedRepo; created: boolean }> {
  const existing = await findTrackedRepo(fullName, { includeRemoved: true });
  if (existing) {
    const repo = existing.removed_at
      ? await queryOne<TrackedRepo>(`UPDATE tracked_repos SET removed_at = NULL, added_at = now() WHERE id = $1 RETURNING ${REPO_COLS}`, [existing.id])
      : existing;
    return { repo: repo ?? existing, created: false };
  }
  const repo = await queryOne<TrackedRepo>(`INSERT INTO tracked_repos (full_name) VALUES ($1) RETURNING ${REPO_COLS}`, [fullName]);
  if (!repo) throw new Error("tracked_repos insert returned no row");
  return { repo, created: true };
}

export async function removeTrackedRepo(id: number): Promise<TrackedRepo | null> {
  return queryOne<TrackedRepo>(`UPDATE tracked_repos SET removed_at = now() WHERE id = $1 AND removed_at IS NULL RETURNING ${REPO_COLS}`, [id]);
}

// ---------------------------------------------------------------------------
// Snapshots of tracked repos
// ---------------------------------------------------------------------------

export interface RepoSnapshotRow {
  id: number;
  repo_id: number;
  captured_at: Date;
  ist_date: string;
  slot: Slot;
  triggered_by: string;
  stars: number;
  forks: number;
  watchers: number;
  open_issues: number;
  closed_issues: number;
  open_prs: number;
  merged_prs: number;
  closed_prs: number;
  contributors: number | null;
  commits: number | null;
  releases: number | null;
  discussions: number | null;
}

const SNAP_COLS = `s.id, s.repo_id, s.captured_at, s.ist_date::text AS ist_date, s.slot, s.triggered_by,
  s.stars, s.forks, s.watchers, s.open_issues, s.closed_issues, s.open_prs, s.merged_prs, s.closed_prs,
  s.contributors, s.commits, s.releases, s.discussions`;

// Same rule as the primary repo's snapshots: only a cron reading taken in the
// first hour of its window defines a day; refreshes only update the live numbers.
const SCHEDULED = `(s.triggered_by = 'cron'
  AND s.captured_at < timezone('Asia/Kolkata', s.ist_date::timestamp) + make_interval(hours => s.slot) + interval '60 minutes')`;

export function latestRepoSnapshot(repoId: number): Promise<RepoSnapshotRow | null> {
  return queryOne<RepoSnapshotRow>(`SELECT ${SNAP_COLS} FROM repo_snapshots s WHERE s.repo_id = $1 ORDER BY s.captured_at DESC LIMIT 1`, [repoId]);
}

export function firstRepoSnapshot(repoId: number): Promise<RepoSnapshotRow | null> {
  return queryOne<RepoSnapshotRow>(`SELECT ${SNAP_COLS} FROM repo_snapshots s WHERE s.repo_id = $1 ORDER BY s.captured_at ASC LIMIT 1`, [repoId]);
}

/** The close-of-day reading per day (see dayCloseSnapshots in queries.ts). */
export function repoDayCloseSnapshots(repoId: number, from: string, to: string): Promise<(RepoSnapshotRow & { date: string })[]> {
  return query<RepoSnapshotRow & { date: string }>(
    `WITH days AS (SELECT generate_series($2::date, $3::date, interval '1 day')::date AS d)
     SELECT DISTINCT ON (days.d) days.d::text AS date, ${SNAP_COLS}
     FROM days
     JOIN repo_snapshots s
       ON s.repo_id = $1 AND (
         (${SCHEDULED} AND ((s.ist_date = days.d AND s.slot >= 6) OR (s.ist_date = days.d + 1 AND s.slot = 0)))
         OR (NOT ${SCHEDULED} AND s.ist_date = days.d))
     ORDER BY days.d, ${SCHEDULED} DESC, s.ist_date DESC, s.slot DESC, s.captured_at DESC`,
    [repoId, from, to],
  );
}

export async function repoSnapshotCount(): Promise<number> {
  const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM repo_snapshots");
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Outside source (external_gains): activity per UTC day or month
// ---------------------------------------------------------------------------

export const EXTERNAL_METRICS = ["stars", "forks", "issues_opened", "issues_closed", "prs_merged"] as const;
export type ExternalMetric = (typeof EXTERNAL_METRICS)[number];
export type ExternalGain = Record<ExternalMetric, number | null>;

/** Per UTC day, keyed by date; used as the estimate for the IST day of the same date. */
export async function externalDaily(repo: string, from: string, to: string): Promise<Map<string, ExternalGain>> {
  const rows = await query<ExternalGain & { date: string }>(
    `SELECT DISTINCT ON (period_start) period_start::text AS date, stars, forks, issues_opened, issues_closed, prs_merged
     FROM external_gains WHERE repo = $1 AND granularity = 'day' AND period_start BETWEEN $2 AND $3
     ORDER BY period_start, captured_at DESC`,
    [repo, from, to],
  );
  return new Map(rows.map(({ date, ...gain }) => [date, gain]));
}

/** Per UTC month, keyed "YYYY-MM", in the shape the month grouping of the trend charts fills from. */
export async function externalMonthly(repo: string): Promise<MonthlyFill> {
  const rows = await query<ExternalGain & { month: string }>(
    `SELECT DISTINCT ON (period_start) to_char(period_start, 'YYYY-MM') AS month, stars, forks, issues_opened, issues_closed, prs_merged
     FROM external_gains WHERE repo = $1 AND granularity = 'month'
     ORDER BY period_start, captured_at DESC`,
    [repo],
  );
  const fill: MonthlyFill = {};
  for (const { month, ...gain } of rows) {
    const entry: MonthlyFill[string] = {};
    for (const m of EXTERNAL_METRICS) if (gain[m] !== null) entry[m] = gain[m] as number;
    fill[month] = entry;
  }
  return fill;
}

async function externalDataStart(repo: string): Promise<string | null> {
  const row = await queryOne<{ d: string | null }>("SELECT min(period_start)::text AS d FROM external_gains WHERE repo = $1 AND granularity = 'day'", [repo]);
  return row?.d ?? null;
}

// ---------------------------------------------------------------------------
// One daily shape for every repo
// ---------------------------------------------------------------------------

export const GAIN_KEYS = ["new_stars", "new_forks", "issues_opened", "issues_closed", "prs_opened", "prs_merged", "commits", "new_contributors", "releases_published"] as const;
export type GainKey = (typeof GAIN_KEYS)[number];

export const TOTAL_KEYS = ["stars", "forks", "watchers", "open_issues", "open_prs", "contributors", "releases"] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];

/** One IST day of one repo. `null` is unknown, never zero. */
export type RepoDay = { date: string; source: "snapshot" | "estimate" | "none"; stars_estimated: boolean; gains_estimated: boolean } & Record<TotalKey, number | null> &
  Record<GainKey, number | null>;

function emptyDay(date: string): RepoDay {
  const day = { date, source: "none", stars_estimated: false, gains_estimated: false } as RepoDay;
  for (const k of TOTAL_KEYS) day[k] = null;
  for (const k of GAIN_KEYS) day[k] = null;
  return day;
}

const nonNegative = (n: number) => Math.max(n, 0);

/** Change between two readings. Counts that only ever grow are clamped at zero: a drop is a deletion, not negative activity. */
function gainsBetween(prev: RepoSnapshotRow, cur: RepoSnapshotRow): Record<GainKey, number | null> {
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : nonNegative(b - a));
  return {
    new_stars: delta(prev.stars, cur.stars),
    new_forks: delta(prev.forks, cur.forks),
    issues_opened: delta(prev.open_issues + prev.closed_issues, cur.open_issues + cur.closed_issues),
    issues_closed: delta(prev.closed_issues, cur.closed_issues),
    prs_opened: delta(prev.open_prs + prev.merged_prs + prev.closed_prs, cur.open_prs + cur.merged_prs + cur.closed_prs),
    prs_merged: delta(prev.merged_prs, cur.merged_prs),
    commits: delta(prev.commits, cur.commits),
    new_contributors: delta(prev.contributors, cur.contributors),
    releases_published: delta(prev.releases, cur.releases),
  };
}

/**
 * End-of-day star and fork totals for the days before a repo's first snapshot,
 * counted back from that snapshot through the outside daily gains for as long
 * as they run without a gap.
 */
async function estimatedTotals(repo: TrackedRepo): Promise<Map<string, { stars: number; forks: number | null }>> {
  const totals = new Map<string, { stars: number; forks: number | null }>();
  const first = await firstRepoSnapshot(repo.id);
  if (!first) return totals;
  const [close] = await repoDayCloseSnapshots(repo.id, first.ist_date, first.ist_date);
  const gains = await externalDaily(repo.full_name, "1970-01-01", first.ist_date);
  let stars = close?.stars ?? first.stars;
  let forks: number | null = close?.forks ?? first.forks;
  let day = first.ist_date;
  // The outside source cannot have the first reading's own day yet when the repo was added
  // that day, so the reading stands in for the previous day's close (off by the part of the
  // day before the reading); importing that day later replaces the guess.
  if (gains.get(day)?.stars == null) {
    totals.set(addDays(day, -1), { stars, forks });
    day = addDays(day, -1);
  }
  for (; gains.get(day)?.stars != null; day = addDays(day, -1)) {
    const g = gains.get(day)!;
    stars -= g.stars ?? 0;
    forks = forks === null || g.forks === null ? null : forks - g.forks;
    totals.set(addDays(day, -1), { stars, forks });
  }
  return totals;
}

/** Earliest IST date a compared repo has anything for, or null when it has nothing yet. */
export async function repoDataStart(repo: TrackedRepo): Promise<string | null> {
  const [first, outside] = await Promise.all([firstRepoSnapshot(repo.id), externalDataStart(repo.full_name)]);
  const candidates = [first?.ist_date, outside].filter((d): d is string => Boolean(d));
  return candidates.length ? candidates.sort()[0] : null;
}

/**
 * One row per IST day for a compared repo. A day with a close-of-day reading
 * carries its totals, and its activity when the day before has one too; other
 * days take the outside source's activity and counted-back totals, as estimates.
 */
export async function repoDailySeries(repo: TrackedRepo, from: string, to: string): Promise<RepoDay[]> {
  const [closes, outside, estimated] = await Promise.all([
    repoDayCloseSnapshots(repo.id, addDays(from, -1), to),
    externalDaily(repo.full_name, from, to),
    estimatedTotals(repo),
  ]);
  const closeByDate = new Map(closes.map((c) => [c.date, c]));
  const days: RepoDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = emptyDay(date);
    const close = closeByDate.get(date);
    const prev = closeByDate.get(addDays(date, -1));
    if (close) {
      day.source = "snapshot";
      day.stars = close.stars;
      day.forks = close.forks;
      day.watchers = close.watchers;
      day.open_issues = close.open_issues;
      day.open_prs = close.open_prs;
      day.contributors = close.contributors;
      day.releases = close.releases;
      if (prev) Object.assign(day, gainsBetween(prev, close));
    } else {
      const totals = estimated.get(date);
      if (totals) {
        day.source = "estimate";
        day.stars = totals.stars;
        day.forks = totals.forks;
        day.stars_estimated = true;
      }
    }
    // The outside source fills the activity our own readings could not measure.
    const gain = outside.get(date);
    if (gain && day.new_stars === null) {
      const filled: Partial<Record<GainKey, number | null>> = {
        new_stars: gain.stars,
        new_forks: gain.forks,
        issues_opened: gain.issues_opened,
        issues_closed: gain.issues_closed,
        prs_merged: gain.prs_merged,
      };
      let any = false;
      for (const [k, v] of Object.entries(filled) as [GainKey, number | null][]) {
        if (v !== null && day[k] === null) {
          day[k] = v;
          any = true;
        }
      }
      if (any) {
        day.gains_estimated = true;
        if (day.source === "none") day.source = "estimate";
      }
    }
    days.push(day);
  }
  return days;
}

/** The primary repo in the same shape, from its richer event-based series. */
export async function primaryDailySeries(from: string, to: string): Promise<RepoDay[]> {
  const points = await dailySeries(from, to);
  return points.map((p) => ({
    date: p.date,
    source: p.source === "snapshot" ? "snapshot" : "estimate",
    stars_estimated: p.stars_estimated,
    gains_estimated: p.stars_estimated,
    stars: p.stars_known ? p.stars : null,
    forks: p.forks,
    watchers: p.watchers,
    open_issues: p.open_issues,
    open_prs: p.open_prs,
    contributors: p.contributors,
    releases: p.releases_total,
    new_stars: p.new_stars_known ? p.new_stars : null,
    new_forks: p.new_forks,
    issues_opened: p.issues_opened,
    issues_closed: p.issues_closed,
    prs_opened: p.prs_opened,
    prs_merged: p.prs_merged,
    commits: p.commits,
    new_contributors: p.new_contributors,
    releases_published: p.releases_published,
  }));
}

/** The activity columns of a daily series, for the trend charts. */
export function toTrendRows(days: RepoDay[]): TrendRow[] {
  return days.map((d) => ({
    date: d.date,
    stars: d.new_stars,
    forks: d.new_forks,
    issues_opened: d.issues_opened,
    issues_closed: d.issues_closed,
    prs_opened: d.prs_opened,
    prs_merged: d.prs_merged,
    commits: d.commits,
  }));
}

// ---------------------------------------------------------------------------
// Everything the Compare page needs, per repo
// ---------------------------------------------------------------------------

/** Live headline numbers, from the latest reading of any kind. */
export type LiveCounts = Record<TotalKey, number | null> & { captured_at: Date; discussions: number | null };

export interface ComparedRepo {
  /** Stable key for chart series and toggles. */
  key: string;
  full_name: string;
  /** The primary repo, i.e. the one the others are compared against. */
  primary: boolean;
  href: string;
  description: string | null;
  language: string | null;
  trendshift_id: number | null;
  /** First IST day with any data, or null for a repo that has nothing yet. */
  data_start: string | null;
  first_snapshot: string | null;
  added_at: string | null;
  live: LiveCounts | null;
  /** One row per day from `data_start` to `to`, oldest first. Empty when there is no data. */
  days: RepoDay[];
  monthly: MonthlyFill;
}

function liveFromSnapshot(s: SnapshotRow | RepoSnapshotRow): LiveCounts {
  return {
    captured_at: s.captured_at,
    stars: s.stars,
    forks: s.forks,
    watchers: s.watchers,
    open_issues: s.open_issues,
    open_prs: s.open_prs,
    contributors: s.contributors,
    releases: s.releases,
    discussions: s.discussions,
  };
}

export async function comparedPrimary(to: string): Promise<ComparedRepo> {
  const [dataStart, latest, first] = await Promise.all([dataStartDate(), latestSnapshot(), firstSnapshot()]);
  const from = dataStart < to ? dataStart : to;
  const [days, monthlyStars] = await Promise.all([primaryDailySeries(from, to), externalMonthlyStars()]);
  return {
    key: "primary",
    full_name: env.repo,
    primary: true,
    href: "/",
    description: null,
    language: null,
    trendshift_id: 14529,
    data_start: from,
    first_snapshot: first?.ist_date ?? null,
    added_at: null,
    live: latest ? liveFromSnapshot(latest) : null,
    days,
    monthly: Object.fromEntries(Object.entries(monthlyStars).map(([month, stars]) => [month, { stars }])),
  };
}

export async function comparedRepo(repo: TrackedRepo, to: string): Promise<ComparedRepo> {
  const [dataStart, latest, first, monthly] = await Promise.all([repoDataStart(repo), latestRepoSnapshot(repo.id), firstRepoSnapshot(repo.id), externalMonthly(repo.full_name)]);
  const from = dataStart && dataStart < to ? dataStart : to;
  const days = dataStart ? await repoDailySeries(repo, from, to) : [];
  return {
    key: `repo-${repo.id}`,
    full_name: repo.full_name,
    primary: false,
    href: `/compare/${repo.full_name}`,
    description: repo.description,
    language: repo.language,
    trendshift_id: repo.trendshift_id,
    data_start: dataStart,
    first_snapshot: first?.ist_date ?? null,
    added_at: repo.added_at.toISOString(),
    live: latest ? liveFromSnapshot(latest) : null,
    days,
    monthly,
  };
}

/** The primary repo first, then the tracked ones in the order they were added. */
export async function comparedRepos(to: string): Promise<ComparedRepo[]> {
  const tracked = await listTrackedRepos();
  return Promise.all([comparedPrimary(to), ...tracked.map((r) => comparedRepo(r, to))]);
}
