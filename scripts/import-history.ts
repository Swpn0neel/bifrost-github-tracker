// Import activity per period from an outside source (Trendshift) into external_gains,
// for the days and months before a repository's first snapshot.
//
//   npm run import:history -- --trendshift <id> [--repo owner/name] [--save capture.json] [--dry-run]
//   npm run import:history -- capture.json [--dry-run]
//
// With --trendshift the repository page https://trendshift.io/repositories/<id> is fetched
// once and the per-day and per-month activity embedded in it is read out; --save keeps
// that capture as a file. A capture file holds
//   { repo, source_name, source_url, captured_on, daily_utc: {"YYYY-MM-DD": gain}, monthly_utc: {"YYYY-MM": gain} }
// where a gain is { stars, forks, merged_prs, issues, closed_issues } (or, in the older
// star-only files, just a number). Days and months are UTC. Periods still running when
// the capture was taken are skipped, and so is the oldest day (the edge of a sliding
// window is usually cut short). Re-running is safe: rows are replaced.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

interface Gain {
  stars?: number;
  forks?: number;
  merged_prs?: number;
  issues?: number;
  closed_issues?: number;
}

interface Capture {
  repo: string;
  source_name: string;
  source_url?: string;
  captured_on: string;
  daily_utc: Record<string, Gain | number>;
  monthly_utc: Record<string, Gain | number>;
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: string) => /^\d{4}-\d{2}$/.test(s);

// --- Trendshift ---------------------------------------------------------------

interface TrendshiftDay {
  full_name: string;
  date: string;
  stars: number;
  forks: number;
  merged_prs: number;
  issues: number;
  closed_issues: number;
}

interface TrendshiftMonth {
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

function pick(g: TrendshiftDay | TrendshiftMonth): Gain {
  return { stars: g.stars, forks: g.forks, merged_prs: g.merged_prs, issues: g.issues, closed_issues: g.closed_issues };
}

async function captureTrendshift(id: number, expectedRepo?: string): Promise<Capture> {
  const url = `https://trendshift.io/repositories/${id}`;
  const res = await fetch(url, { headers: { "User-Agent": "bifrost-github-tracker (one-time history import)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const arrays = embeddedArrays(html, "activities");
  const daily = arrays.find((a): a is TrendshiftDay[] => a.length > 0 && typeof (a[0] as TrendshiftDay).date === "string" && "stars" in (a[0] as object));
  const monthly = arrays.find((a): a is TrendshiftMonth[] => a.length > 0 && typeof (a[0] as TrendshiftMonth).year === "number" && "stars" in (a[0] as object));
  if (!daily || !monthly) throw new Error(`${url}: could not find the daily and monthly activity in the page`);
  const repo = daily[0].full_name;
  if (expectedRepo && repo.toLowerCase() !== expectedRepo.toLowerCase()) throw new Error(`${url} is ${repo}, not ${expectedRepo}`);

  const daily_utc: Record<string, Gain> = {};
  for (const d of daily) daily_utc[d.date.slice(0, 10)] = pick(d);
  const monthly_utc: Record<string, Gain> = {};
  for (const m of monthly) monthly_utc[`${m.year}-${String(m.month).padStart(2, "0")}`] = pick(m);
  return { repo, source_name: "trendshift", source_url: url, captured_on: new Date().toISOString().slice(0, 10), daily_utc, monthly_utc };
}

// --- import -------------------------------------------------------------------

type Row = [granularity: "day" | "month", period_start: string, gain: Gain];

function asGain(value: Gain | number): Gain {
  return typeof value === "number" ? { stars: value } : value;
}

function rowsFromCapture(capture: Capture): Row[] {
  const rows: Row[] = [];
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const dryRun = args.includes("--dry-run");
  const trendshift = flag("--trendshift");
  const save = flag("--save");
  const file = args.find((a, i) => !a.startsWith("--") && !["--trendshift", "--repo", "--save"].includes(args[i - 1] ?? ""));

  let capture: Capture;
  if (trendshift) {
    if (!/^\d+$/.test(trendshift)) throw new Error("--trendshift takes the numeric id from the trendshift.io/repositories/<id> URL");
    capture = await captureTrendshift(Number(trendshift), flag("--repo"));
    if (save) {
      writeFileSync(resolve(process.cwd(), save), JSON.stringify(capture, null, 1) + "\n");
      console.log(`saved capture to ${save}`);
    }
  } else if (file) {
    capture = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as Capture;
    capture.repo ??= flag("--repo") ?? process.env.GITHUB_REPO ?? "maximhq/bifrost";
  } else {
    throw new Error("usage: npm run import:history -- --trendshift <id> [--repo owner/name] [--save file] [--dry-run] | <capture.json> [--dry-run]");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(capture.repo ?? "")) throw new Error("repo must be owner/name");
  if (!/^[a-z0-9_-]+$/.test(capture.source_name ?? "")) throw new Error("source_name must be a short slug");
  if (!isDay(capture.captured_on ?? "")) throw new Error("captured_on must be YYYY-MM-DD");

  const rows = rowsFromCapture(capture);
  const count = (g: string) => rows.filter((r) => r[0] === g);
  const sum = (g: string, k: keyof Gain) => count(g).reduce((acc, r) => acc + (r[2][k] ?? 0), 0);
  console.log(
    `${capture.repo} from ${capture.source_name}: ${count("day").length} days (${sum("day", "stars")} stars, ${sum("day", "forks")} forks), ` +
      `${count("month").length} months (${sum("month", "stars")} stars, ${sum("month", "forks")} forks)`,
  );
  if (dryRun) return console.log("dry run, nothing written");

  const { getPool } = await import("../src/lib/db");
  const pool = getPool();
  const col = (k: keyof Gain) => rows.map((r) => r[2][k] ?? null);
  await pool.query(
    `INSERT INTO external_gains (repo, source, granularity, period_start, stars, forks, issues_opened, issues_closed, prs_merged)
     SELECT $1, $2, g, p::date, s, f, io, ic, pm
     FROM unnest($3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::int[], $9::int[]) AS t(g, p, s, f, io, ic, pm)
     ON CONFLICT (repo, source, granularity, period_start) DO UPDATE SET
       stars = EXCLUDED.stars, forks = EXCLUDED.forks, issues_opened = EXCLUDED.issues_opened,
       issues_closed = EXCLUDED.issues_closed, prs_merged = EXCLUDED.prs_merged, captured_at = now()`,
    [capture.repo, capture.source_name, rows.map((r) => r[0]), rows.map((r) => r[1]), col("stars"), col("forks"), col("issues"), col("closed_issues"), col("merged_prs")],
  );
  if (trendshift) {
    const updated = await pool.query("UPDATE tracked_repos SET trendshift_id = $2 WHERE lower(full_name) = lower($1) RETURNING id", [capture.repo, Number(trendshift)]);
    if (updated.rowCount) console.log(`linked Trendshift #${trendshift} on the Compare page`);
  }
  await pool.end();
  console.log(`upserted ${rows.length} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
