// The outside source for history before a repository's first reading: Trendshift's
// repository page embeds per-day (about 60 days) and per-month (about 24 months)
// stars, forks, merged PRs and issues opened/closed. One page fetch per import.
import { query } from "./db";

export interface TrendshiftGain {
  stars?: number;
  forks?: number;
  merged_prs?: number;
  issues?: number;
  closed_issues?: number;
}

/** What one fetch yields, and the shape of a saved capture file. Days and months are UTC. */
export interface TrendshiftCapture {
  repo: string;
  source_name: string;
  source_url?: string;
  captured_on: string;
  trendshift_id?: number;
  /** A number is the older star-only form. */
  daily_utc: Record<string, TrendshiftGain | number>;
  monthly_utc: Record<string, TrendshiftGain | number>;
}

export class TrendshiftMismatch extends Error {
  constructor(
    readonly url: string,
    readonly pageRepo: string,
    readonly expected: string,
  ) {
    super(`${url} is ${pageRepo}, not ${expected}`);
    this.name = "TrendshiftMismatch";
  }
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: string) => /^\d{4}-\d{2}$/.test(s);

/** "12345" or a trendshift.io/repositories/12345 link -> 12345; null for anything else. */
export function parseTrendshiftInput(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const match = s.match(/^(?:\d+|(?:https?:\/\/)?(?:www\.)?trendshift\.io\/repositories\/(\d+)(?:[/?#].*)?)$/i);
  if (!match) return null;
  return Number(match[1] ?? s);
}

export const trendshiftUrl = (id: number) => `https://trendshift.io/repositories/${id}`;

/** A dashboard refresh may fetch the page; a slow source must not hold that request for long. */
const FETCH_TIMEOUT_MS = 20_000;

interface PageDay {
  full_name: string;
  date: string;
  stars: number;
  forks: number;
  merged_prs: number;
  issues: number;
  closed_issues: number;
}

interface PageMonth {
  year: number;
  month: number;
  stars: number;
  forks: number;
  merged_prs: number;
  issues: number;
  closed_issues: number;
}

/** Every JSON array under a given key in the page's embedded (quote-escaped) payload. */
function embeddedArrays(html: string, key: string): unknown[][] {
  const out: unknown[][] = [];
  const marker = `\\"${key}\\":[`;
  let at = html.indexOf(marker);
  while (at !== -1) {
    const start = at + marker.length - 1;
    let depth = 0;
    let i = start;
    for (; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]" && --depth === 0) break;
    }
    try {
      out.push(JSON.parse(html.slice(start, i + 1).replace(/\\"/g, '"')));
    } catch {
      // not the array we are after
    }
    at = html.indexOf(marker, i);
  }
  return out;
}

const pick = (g: PageDay | PageMonth): TrendshiftGain => ({ stars: g.stars, forks: g.forks, merged_prs: g.merged_prs, issues: g.issues, closed_issues: g.closed_issues });

/** Fetch the repository page once and read the activity out of it. With `expectedRepo`, a page for another repository is refused. */
export async function fetchTrendshift(id: number, expectedRepo?: string): Promise<TrendshiftCapture> {
  const url = trendshiftUrl(id);
  const res = await fetch(url, { headers: { "User-Agent": "bifrost-github-tracker (one-time history import)" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const arrays = embeddedArrays(html, "activities");
  const daily = arrays.find((a): a is PageDay[] => a.length > 0 && typeof (a[0] as PageDay).date === "string" && "stars" in (a[0] as object));
  const monthly = arrays.find((a): a is PageMonth[] => a.length > 0 && typeof (a[0] as PageMonth).year === "number" && "stars" in (a[0] as object));
  if (!daily || !monthly) throw new Error(`${url}: could not find the daily and monthly activity in the page`);
  const repo = daily[0].full_name;
  if (expectedRepo && repo.toLowerCase() !== expectedRepo.toLowerCase()) throw new TrendshiftMismatch(url, repo, expectedRepo);

  const daily_utc: Record<string, TrendshiftGain> = {};
  for (const d of daily) daily_utc[d.date.slice(0, 10)] = pick(d);
  const monthly_utc: Record<string, TrendshiftGain> = {};
  for (const m of monthly) monthly_utc[`${m.year}-${String(m.month).padStart(2, "0")}`] = pick(m);
  return { repo, source_name: "trendshift", source_url: url, trendshift_id: id, captured_on: new Date().toISOString().slice(0, 10), daily_utc, monthly_utc };
}

export type CaptureRow = [granularity: "day" | "month", period_start: string, gain: TrendshiftGain];

const asGain = (value: TrendshiftGain | number): TrendshiftGain => (typeof value === "number" ? { stars: value } : value);

/**
 * The rows worth storing: periods that had ended when the capture was taken, minus the
 * oldest day (the edge of a sliding window is usually cut short).
 */
export function captureRows(capture: TrendshiftCapture): CaptureRow[] {
  if (!/^[\w.-]+\/[\w.-]+$/.test(capture.repo ?? "")) throw new Error("repo must be owner/name");
  if (!/^[a-z0-9_-]+$/.test(capture.source_name ?? "")) throw new Error("source_name must be a short slug");
  if (!isDay(capture.captured_on ?? "")) throw new Error("captured_on must be YYYY-MM-DD");
  const rows: CaptureRow[] = [];
  const days = Object.keys(capture.daily_utc).sort();
  for (const day of days.slice(1)) {
    if (!isDay(day)) throw new Error(`bad day ${day}`);
    if (day < capture.captured_on) rows.push(["day", day, asGain(capture.daily_utc[day])]);
  }
  for (const month of Object.keys(capture.monthly_utc).sort()) {
    if (!isMonth(month)) throw new Error(`bad month ${month}`);
    if (month < capture.captured_on.slice(0, 7)) rows.push(["month", `${month}-01`, asGain(capture.monthly_utc[month])]);
  }
  for (const [, period, gain] of rows) {
    for (const v of Object.values(gain)) if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw new Error(`bad value for ${period}`);
  }
  return rows;
}

export interface ImportSummary {
  days: number;
  months: number;
  /** Last UTC day the capture covered, or null when it had none. */
  lastDay: string | null;
}

/** Store a capture's rows (replacing earlier ones for the same periods) and remember the Trendshift id on the tracked repo. */
export async function importCapture(capture: TrendshiftCapture): Promise<ImportSummary> {
  const rows = captureRows(capture);
  const col = (k: keyof TrendshiftGain) => rows.map((r) => r[2][k] ?? null);
  if (rows.length) {
    await query(
      `INSERT INTO external_gains (repo, source, granularity, period_start, stars, forks, issues_opened, issues_closed, prs_merged)
       SELECT $1, $2, g, p::date, s, f, io, ic, pm
       FROM unnest($3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::int[], $9::int[]) AS t(g, p, s, f, io, ic, pm)
       ON CONFLICT (repo, source, granularity, period_start) DO UPDATE SET
         stars = EXCLUDED.stars, forks = EXCLUDED.forks, issues_opened = EXCLUDED.issues_opened,
         issues_closed = EXCLUDED.issues_closed, prs_merged = EXCLUDED.prs_merged, captured_at = now()`,
      [capture.repo, capture.source_name, rows.map((r) => r[0]), rows.map((r) => r[1]), col("stars"), col("forks"), col("issues"), col("closed_issues"), col("merged_prs")],
    );
  }
  if (capture.trendshift_id) {
    await query("UPDATE tracked_repos SET trendshift_id = $2 WHERE lower(full_name) = lower($1)", [capture.repo, capture.trendshift_id]);
  }
  const dayRows = rows.filter((r) => r[0] === "day");
  return { days: dayRows.length, months: rows.length - dayRows.length, lastDay: dayRows.length ? dayRows[dayRows.length - 1][1] : null };
}
