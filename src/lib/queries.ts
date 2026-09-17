import { query, queryOne } from "./db";
import { addDays, istDate, istMidnightUtc, type Slot } from "./time";

// IST bucketing helpers. Columns are timestamptz; AT TIME ZONE yields IST wall-clock.
const IST = (col: string) => `(${col} AT TIME ZONE 'Asia/Kolkata')`;
const DAY = (col: string) => `${IST(col)}::date`;
const SLOT = (col: string) => `(extract(hour from ${IST(col)})::int / 6) * 6`;

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export interface SnapshotRow {
  id: number;
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
  size_kb: number | null;
}

const SNAPSHOT_COLS = `s.id, s.captured_at, s.ist_date::text AS ist_date, s.slot, s.triggered_by,
  s.stars, s.forks, s.watchers, s.open_issues, s.closed_issues, s.open_prs, s.merged_prs, s.closed_prs,
  s.contributors, s.commits, s.releases, s.discussions, s.size_kb`;

export function latestSnapshot(): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(`SELECT ${SNAPSHOT_COLS} FROM snapshots s ORDER BY s.captured_at DESC LIMIT 1`);
}

export function firstSnapshot(): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(`SELECT ${SNAPSHOT_COLS} FROM snapshots s ORDER BY s.captured_at ASC LIMIT 1`);
}

/** True when the stargazers table has rows, i.e. GitHub let this token list stars. */
export async function hasStarEvents(): Promise<boolean> {
  const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM stargazers");
  return (row?.n ?? 0) > 0;
}

/** Earliest IST date we have any data for (events or snapshots). */
export async function dataStartDate(): Promise<string> {
  const row = await queryOne<{ d: string | null }>(
    `SELECT to_char(${IST(`LEAST(
       (SELECT min(starred_at) FROM stargazers),
       (SELECT min(created_at) FROM forks),
       (SELECT min(created_at) FROM issues),
       (SELECT min(committed_at) FROM commits),
       (SELECT min(captured_at) FROM snapshots)
     )`)}, 'YYYY-MM-DD') AS d`,
  );
  return row?.d ?? addDays(istDate(), -30);
}

/**
 * A scheduled snapshot is one the collector CLI took within the first hour of its
 * window. Dashboard refreshes and off-schedule runs (Railway "Run now", a late
 * retry) still update the live numbers, but they never override a scheduled
 * reading: windows use scheduled readings only, and a day falls back to other
 * readings only when it has no scheduled one at all.
 */
const SCHEDULED = `(s.triggered_by = 'cron'
  AND s.captured_at < timezone('Asia/Kolkata', s.ist_date::timestamp) + make_interval(hours => s.slot) + interval '60 minutes')`;

/**
 * The "close of day" snapshot for each day: the latest scheduled reading from
 * D 6 AM through D+1 12 AM (the next day's midnight run when it exists). A day
 * without any scheduled reading uses the last snapshot taken on it instead.
 */
export function dayCloseSnapshots(from: string, to: string): Promise<(SnapshotRow & { date: string })[]> {
  return query<SnapshotRow & { date: string }>(
    `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d)
     SELECT DISTINCT ON (days.d) days.d::text AS date, ${SNAPSHOT_COLS}
     FROM days
     JOIN snapshots s
       ON (${SCHEDULED} AND ((s.ist_date = days.d AND s.slot >= 6) OR (s.ist_date = days.d + 1 AND s.slot = 0)))
       OR (NOT ${SCHEDULED} AND s.ist_date = days.d)
     ORDER BY days.d, ${SCHEDULED} DESC, s.ist_date DESC, s.slot DESC, s.captured_at DESC`,
    [from, to],
  );
}

// ---------------------------------------------------------------------------
// Event-derived activity (gross counts per IST day / slot)
// ---------------------------------------------------------------------------

export interface Activity {
  new_stars: number;
  unstars: number;
  new_forks: number;
  issues_opened: number;
  issues_closed: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits: number;
  new_contributors: number;
  releases_published: number;
}

export interface DailyActivity extends Activity {
  date: string;
}

export interface SlotActivity extends Activity {
  date: string;
  slot: Slot;
}

const NEW_CONTRIBUTORS_SRC = `(SELECT author_login, min(committed_at) AS first_at FROM commits WHERE author_login IS NOT NULL GROUP BY 1)`;

// [alias, source table/subquery, timestamp column, extra predicate]
const ACTIVITY_SOURCES: [keyof Activity, string, string, string][] = [
  ["new_stars", "stargazers", "starred_at", "TRUE"],
  ["unstars", "stargazers", "unstarred_at", "unstarred_at IS NOT NULL"],
  ["new_forks", "forks", "created_at", "TRUE"],
  ["issues_opened", "issues", "created_at", "NOT is_pr"],
  ["issues_closed", "issues", "closed_at", "NOT is_pr"],
  ["prs_opened", "issues", "created_at", "is_pr"],
  ["prs_merged", "issues", "merged_at", "is_pr"],
  ["prs_closed", "issues", "closed_at", "is_pr AND merged_at IS NULL"],
  ["commits", "commits", "committed_at", "TRUE"],
  ["new_contributors", NEW_CONTRIBUTORS_SRC + " nc_src", "first_at", "TRUE"],
  ["releases_published", "releases", "published_at", "NOT draft"],
];

function activitySql(granularity: "day" | "slot"): string {
  const grid =
    granularity === "day"
      ? `grid AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d)`
      : `grid AS (SELECT d::date AS d, s::int AS s FROM generate_series($1::date, $2::date, interval '1 day') d CROSS JOIN unnest(ARRAY[0,6,12,18]) s)`;
  // CTE names are prefixed so none shadows a real table (a CTE called "commits"
  // would hijack the FROM commits inside the new-contributors subquery).
  const ctes = ACTIVITY_SOURCES.map(([alias, src, col, where]) => {
    const bucket = granularity === "day" ? `${DAY(col)} AS d` : `${DAY(col)} AS d, ${SLOT(col)} AS s`;
    const group = granularity === "day" ? "GROUP BY 1" : "GROUP BY 1, 2";
    return `a_${alias} AS (SELECT ${bucket}, count(*)::int AS n FROM ${src} WHERE ${where} AND ${col} >= $3 AND ${col} < $4 ${group})`;
  });
  const joinOn = (alias: string) =>
    granularity === "day" ? `a_${alias}.d = grid.d` : `a_${alias}.d = grid.d AND a_${alias}.s = grid.s`;
  const selects = ACTIVITY_SOURCES.map(([alias]) => `coalesce(a_${alias}.n, 0) AS ${alias}`);
  const joins = ACTIVITY_SOURCES.map(([alias]) => `LEFT JOIN a_${alias} ON ${joinOn(alias)}`);
  const keyCols = granularity === "day" ? `grid.d::text AS date` : `grid.d::text AS date, grid.s AS slot`;
  const order = granularity === "day" ? "ORDER BY grid.d" : "ORDER BY grid.d, grid.s";
  return `WITH ${grid}, ${ctes.join(", ")} SELECT ${keyCols}, ${selects.join(", ")} FROM grid ${joins.join(" ")} ${order}`;
}

const DAILY_ACTIVITY_SQL = activitySql("day");
const SLOT_ACTIVITY_SQL = activitySql("slot");

function rangeBounds(from: string, to: string): [string, string, Date, Date] {
  return [from, to, istMidnightUtc(from), istMidnightUtc(addDays(to, 1))];
}

export function dailyActivity(from: string, to: string): Promise<DailyActivity[]> {
  return query<DailyActivity>(DAILY_ACTIVITY_SQL, rangeBounds(from, to));
}

export function slotActivity(from: string, to: string): Promise<SlotActivity[]> {
  return query<SlotActivity>(SLOT_ACTIVITY_SQL, rangeBounds(from, to));
}

// ---------------------------------------------------------------------------
// Reconstructed totals (from events) and the merged daily series
// ---------------------------------------------------------------------------

export interface Totals {
  stars: number;
  forks: number;
  open_issues: number;
  closed_issues: number;
  open_prs: number;
  merged_prs: number;
  closed_prs: number;
  commits_total: number;
  contributors: number;
  releases_total: number;
}

const ZERO_TOTALS: Totals = {
  stars: 0,
  forks: 0,
  open_issues: 0,
  closed_issues: 0,
  open_prs: 0,
  merged_prs: 0,
  closed_prs: 0,
  commits_total: 0,
  contributors: 0,
  releases_total: 0,
};

const TOTAL_KEYS = Object.keys(ZERO_TOTALS) as (keyof Totals)[];

/** Totals implied by the event tables at a UTC instant. */
export async function totalsAt(at: Date): Promise<Totals> {
  const row = await queryOne<Totals>(
    `SELECT
      (SELECT count(*) FROM stargazers WHERE starred_at < $1 AND (unstarred_at IS NULL OR unstarred_at >= $1))::int AS stars,
      (SELECT count(*) FROM forks WHERE created_at < $1)::int AS forks,
      (SELECT count(*) FROM issues WHERE NOT is_pr AND created_at < $1 AND (closed_at IS NULL OR closed_at >= $1))::int AS open_issues,
      (SELECT count(*) FROM issues WHERE NOT is_pr AND closed_at < $1)::int AS closed_issues,
      (SELECT count(*) FROM issues WHERE is_pr AND created_at < $1 AND (closed_at IS NULL OR closed_at >= $1))::int AS open_prs,
      (SELECT count(*) FROM issues WHERE is_pr AND merged_at < $1)::int AS merged_prs,
      (SELECT count(*) FROM issues WHERE is_pr AND merged_at IS NULL AND closed_at < $1)::int AS closed_prs,
      (SELECT count(*) FROM commits WHERE committed_at < $1)::int AS commits_total,
      (SELECT count(DISTINCT author_login) FROM commits WHERE author_login IS NOT NULL AND committed_at < $1)::int AS contributors,
      (SELECT count(*) FROM releases WHERE NOT draft AND published_at < $1)::int AS releases_total`,
    [at],
  );
  return row ?? { ...ZERO_TOTALS };
}

function advance(t: Totals, a: Activity): Totals {
  return {
    stars: t.stars + a.new_stars - a.unstars,
    forks: t.forks + a.new_forks,
    open_issues: t.open_issues + a.issues_opened - a.issues_closed,
    closed_issues: t.closed_issues + a.issues_closed,
    open_prs: t.open_prs + a.prs_opened - a.prs_merged - a.prs_closed,
    merged_prs: t.merged_prs + a.prs_merged,
    closed_prs: t.closed_prs + a.prs_closed,
    commits_total: t.commits_total + a.commits,
    contributors: t.contributors + a.new_contributors,
    releases_total: t.releases_total + a.releases_published,
  };
}

function snapshotTotals(s: SnapshotRow, fallback: Totals): Totals {
  return {
    stars: s.stars,
    forks: s.forks,
    open_issues: s.open_issues,
    closed_issues: s.closed_issues,
    open_prs: s.open_prs,
    merged_prs: s.merged_prs,
    closed_prs: s.closed_prs,
    commits_total: s.commits ?? fallback.commits_total,
    contributors: s.contributors ?? fallback.contributors,
    releases_total: s.releases ?? fallback.releases_total,
  };
}

function combine(a: Totals, b: Totals, sign: 1 | -1): Totals {
  const out = { ...ZERO_TOTALS };
  for (const k of TOTAL_KEYS) out[k] = a[k] + sign * b[k];
  return out;
}

export interface DailyPoint extends DailyActivity, Totals {
  source: "snapshot" | "reconstructed";
  watchers: number | null;
  discussions: number | null;
  snapshot_at: string | null;
}

/**
 * One point per IST day. Days with a real snapshot use it; other days are
 * reconstructed from event timestamps and anchored to the nearest snapshot so
 * the two sources join without a visible step.
 */
export async function dailySeries(from: string, to: string): Promise<DailyPoint[]> {
  const [activity, closes, base, starEvents] = await Promise.all([
    dailyActivity(from, to),
    dayCloseSnapshots(from, to),
    totalsAt(istMidnightUtc(from)),
    hasStarEvents(),
  ]);
  const closeByDate = new Map(closes.map((c) => [c.date, c]));

  const recon: Totals[] = [];
  let running = base;
  for (const a of activity) {
    running = advance(running, a);
    recon.push(running);
  }

  const offsets = activity.map((a, i) => {
    const s = closeByDate.get(a.date);
    return s ? combine(snapshotTotals(s, recon[i]), recon[i], -1) : null;
  });
  let offset = offsets.find((o) => o !== null) ?? ZERO_TOTALS;

  const points: DailyPoint[] = activity.map((a, i) => {
    const s = closeByDate.get(a.date);
    if (s) {
      offset = offsets[i] ?? offset;
      return {
        ...a,
        ...snapshotTotals(s, recon[i]),
        source: "snapshot",
        watchers: s.watchers,
        discussions: s.discussions,
        snapshot_at: s.captured_at.toISOString(),
      };
    }
    return {
      ...a,
      ...combine(recon[i], offset, 1),
      source: "reconstructed",
      watchers: null,
      discussions: null,
      snapshot_at: null,
    };
  });

  // Without a stargazer list, the only star signal is the net change between
  // consecutive daily snapshots.
  if (!starEvents) {
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      if (p.source === "snapshot" && prev.source === "snapshot") {
        const diff = p.stars - prev.stars;
        p.new_stars = Math.max(diff, 0);
        p.unstars = Math.max(-diff, 0);
      }
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Slot ("quarter of day") series
// ---------------------------------------------------------------------------

export interface SlotSnapshot {
  date: string;
  slot: Slot;
  captured_at: Date;
  stars: number;
  forks: number;
  watchers: number;
  open_issues: number;
  open_prs: number;
}

/** The scheduled reading at the start of each 6-hour window. */
export function slotSnapshots(from: string, to: string): Promise<SlotSnapshot[]> {
  return query<SlotSnapshot>(
    `SELECT DISTINCT ON (s.ist_date, s.slot) s.ist_date::text AS date, s.slot, s.captured_at, s.stars, s.forks, s.watchers, s.open_issues, s.open_prs
     FROM snapshots s WHERE s.ist_date BETWEEN $1 AND $2 AND ${SCHEDULED}
     ORDER BY s.ist_date, s.slot, s.captured_at ASC`,
    [from, to],
  );
}

export interface SlotPoint extends SlotActivity {
  /** Snapshot value at the start of the window, when the collector ran. */
  stars_at: number | null;
  forks_at: number | null;
  open_issues_at: number | null;
  open_prs_at: number | null;
  /** Net change across the window from consecutive snapshots (null if either is missing). */
  net_stars: number | null;
  net_forks: number | null;
  captured_at: string | null;
}

export async function slotSeries(from: string, to: string): Promise<SlotPoint[]> {
  const [activity, snaps, starEvents] = await Promise.all([
    slotActivity(from, to),
    slotSnapshots(from, addDays(to, 1)),
    hasStarEvents(),
  ]);
  const byKey = new Map(snaps.map((s) => [`${s.date}:${s.slot}`, s]));
  const nextKey = (date: string, slot: Slot) => (slot === 18 ? `${addDays(date, 1)}:0` : `${date}:${slot + 6}`);
  return activity.map((a) => {
    const here = byKey.get(`${a.date}:${a.slot}`);
    const next = byKey.get(nextKey(a.date, a.slot));
    const net_stars = here && next ? next.stars - here.stars : null;
    const point: SlotPoint = {
      ...a,
      stars_at: here?.stars ?? null,
      forks_at: here?.forks ?? null,
      open_issues_at: here?.open_issues ?? null,
      open_prs_at: here?.open_prs ?? null,
      net_stars,
      net_forks: here && next ? next.forks - here.forks : null,
      captured_at: here ? here.captured_at.toISOString() : null,
    };
    if (!starEvents && net_stars !== null) {
      point.new_stars = Math.max(net_stars, 0);
      point.unstars = Math.max(-net_stars, 0);
    }
    return point;
  });
}

export type HeatmapMetric = "stars" | "forks" | "issues" | "prs" | "commits";

const HEATMAP_SOURCES: Record<HeatmapMetric, [string, string, string]> = {
  stars: ["stargazers", "starred_at", "TRUE"],
  forks: ["forks", "created_at", "TRUE"],
  issues: ["issues", "created_at", "NOT is_pr"],
  prs: ["issues", "created_at", "is_pr"],
  commits: ["commits", "committed_at", "TRUE"],
};

/** Event counts by IST weekday (0=Sun) and slot, for "when does activity happen". */
export function slotWeekdayCounts(from: string, to: string, metric: HeatmapMetric): Promise<{ dow: number; slot: Slot; n: number }[]> {
  const [table, col, where] = HEATMAP_SOURCES[metric];
  return query(
    `SELECT extract(dow from ${IST(col)})::int AS dow, ${SLOT(col)} AS slot, count(*)::int AS n
     FROM ${table} WHERE ${where} AND ${col} >= $1 AND ${col} < $2 GROUP BY 1, 2`,
    [istMidnightUtc(from), istMidnightUtc(addDays(to, 1))],
  );
}

// ---------------------------------------------------------------------------
// Issues & PRs
// ---------------------------------------------------------------------------

export interface IssueStats {
  median_issue_close_days: number | null;
  issues_closed_n: number;
  median_pr_merge_days: number | null;
  prs_merged_n: number;
  prs_closed_unmerged_n: number;
}

export async function issueStats(from: string, to: string): Promise<IssueStats> {
  const row = await queryOne<IssueStats>(
    `SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM closed_at - created_at) / 86400)
        FILTER (WHERE NOT is_pr AND closed_at >= $1 AND closed_at < $2) AS median_issue_close_days,
      count(*) FILTER (WHERE NOT is_pr AND closed_at >= $1 AND closed_at < $2)::int AS issues_closed_n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM merged_at - created_at) / 86400)
        FILTER (WHERE is_pr AND merged_at >= $1 AND merged_at < $2) AS median_pr_merge_days,
      count(*) FILTER (WHERE is_pr AND merged_at >= $1 AND merged_at < $2)::int AS prs_merged_n,
      count(*) FILTER (WHERE is_pr AND merged_at IS NULL AND closed_at >= $1 AND closed_at < $2)::int AS prs_closed_unmerged_n
     FROM issues`,
    [istMidnightUtc(from), istMidnightUtc(addDays(to, 1))],
  );
  return row ?? { median_issue_close_days: null, issues_closed_n: 0, median_pr_merge_days: null, prs_merged_n: 0, prs_closed_unmerged_n: 0 };
}

export const AGE_BUCKETS = ["< 1 week", "1–4 weeks", "1–3 months", "3+ months"] as const;

export async function openAgeBuckets(kind: "issue" | "pr"): Promise<{ bucket: string; n: number }[]> {
  const rows = await query<{ bucket: string; n: number }>(
    `SELECT CASE
        WHEN age < interval '7 days' THEN '${AGE_BUCKETS[0]}'
        WHEN age < interval '30 days' THEN '${AGE_BUCKETS[1]}'
        WHEN age < interval '90 days' THEN '${AGE_BUCKETS[2]}'
        ELSE '${AGE_BUCKETS[3]}' END AS bucket, count(*)::int AS n
     FROM (SELECT now() - created_at AS age FROM issues WHERE is_pr = $1 AND state = 'open') x
     GROUP BY 1`,
    [kind === "pr"],
  );
  const byBucket = new Map(rows.map((r) => [r.bucket, r.n]));
  return AGE_BUCKETS.map((bucket) => ({ bucket, n: byBucket.get(bucket) ?? 0 }));
}

export function openIssueLabels(limit = 12): Promise<{ label: string; n: number }[]> {
  return query(
    `SELECT l AS label, count(*)::int AS n FROM issues, unnest(labels) AS l
     WHERE NOT is_pr AND state = 'open' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT $1`,
    [limit],
  );
}

export interface IssueListRow {
  number: number;
  title: string;
  author: string | null;
  created_at: Date;
  comments: number;
  labels: string[];
}

export function oldestOpenIssues(limit = 10): Promise<IssueListRow[]> {
  return query<IssueListRow>(
    `SELECT number, title, author, created_at, comments, labels FROM issues
     WHERE NOT is_pr AND state = 'open' ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
}

export function mostDiscussedOpenIssues(limit = 10): Promise<IssueListRow[]> {
  return query<IssueListRow>(
    `SELECT number, title, author, created_at, comments, labels FROM issues
     WHERE NOT is_pr AND state = 'open' ORDER BY comments DESC, created_at ASC LIMIT $1`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Activity: contributors & releases
// ---------------------------------------------------------------------------

export function topContributors(from: string, to: string, limit = 15): Promise<{ author_login: string; commits: number }[]> {
  return query(
    `SELECT author_login, count(*)::int AS commits FROM commits
     WHERE author_login IS NOT NULL AND committed_at >= $1 AND committed_at < $2
     GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT $3`,
    [istMidnightUtc(from), istMidnightUtc(addDays(to, 1)), limit],
  );
}

export interface ReleaseRow {
  tag: string;
  name: string | null;
  prerelease: boolean;
  published_at: Date;
}

export function releasesIn(from: string, to: string, limit = 60): Promise<ReleaseRow[]> {
  return query<ReleaseRow>(
    `SELECT tag, name, prerelease, published_at FROM releases
     WHERE NOT draft AND published_at >= $1 AND published_at < $2
     ORDER BY published_at DESC LIMIT $3`,
    [istMidnightUtc(from), istMidnightUtc(addDays(to, 1)), limit],
  );
}

// ---------------------------------------------------------------------------
// Collector status
// ---------------------------------------------------------------------------

export interface CollectorRun {
  id: number;
  kind: string;
  triggered_by: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  api_calls: number;
  detail: Record<string, unknown> | null;
  error: string | null;
}

export function collectorRuns(limit = 40): Promise<CollectorRun[]> {
  return query<CollectorRun>(
    `SELECT id, kind, triggered_by, status, started_at, finished_at, api_calls, detail, error
     FROM collector_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
}

/** True while a run started in the last 10 minutes has not finished (older stragglers were killed mid-run). */
export async function runInProgress(): Promise<boolean> {
  const row = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM collector_runs WHERE finished_at IS NULL AND started_at > now() - interval '10 minutes'",
  );
  return (row?.n ?? 0) > 0;
}

export function syncState(): Promise<{ key: string; value: string; updated_at: Date }[]> {
  return query("SELECT key, value, updated_at FROM sync_state ORDER BY key");
}

export interface TableCounts {
  stargazers: number;
  forks: number;
  issues: number;
  prs: number;
  commits: number;
  releases: number;
  snapshots: number;
}

export async function tableCounts(): Promise<TableCounts> {
  const row = await queryOne<TableCounts>(
    `SELECT
      (SELECT count(*) FROM stargazers WHERE unstarred_at IS NULL)::int AS stargazers,
      (SELECT count(*) FROM forks)::int AS forks,
      (SELECT count(*) FROM issues WHERE NOT is_pr)::int AS issues,
      (SELECT count(*) FROM issues WHERE is_pr)::int AS prs,
      (SELECT count(*) FROM commits)::int AS commits,
      (SELECT count(*) FROM releases)::int AS releases,
      (SELECT count(*) FROM snapshots)::int AS snapshots`,
  );
  return row ?? { stargazers: 0, forks: 0, issues: 0, prs: 0, commits: 0, releases: 0, snapshots: 0 };
}
