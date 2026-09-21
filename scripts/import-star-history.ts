// One-time import of star gains from an outside source into external_star_gains.
//   npm run import:stars -- path/to/capture.json [--dry-run]
//
// The file holds { source_name, captured_on, daily_utc: {"YYYY-MM-DD": n}, monthly_utc: {"YYYY-MM": n} }.
// Periods that were still running when the file was captured are skipped, and so is the
// oldest day (the edge of a sliding window is usually cut short). Re-running is safe.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

interface Capture {
  source_name: string;
  captured_on: string;
  daily_utc: Record<string, number>;
  monthly_utc: Record<string, number>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("usage: npm run import:stars -- <capture.json> [--dry-run]");
  const capture = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as Capture;
  if (!/^[a-z0-9_-]+$/.test(capture.source_name ?? "")) throw new Error("source_name must be a short slug");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capture.captured_on ?? "")) throw new Error("captured_on must be YYYY-MM-DD");

  const days = Object.keys(capture.daily_utc).sort();
  const rows: [string, string, number][] = [];
  for (const day of days.slice(1)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`bad day ${day}`);
    if (day < capture.captured_on) rows.push(["day", day, capture.daily_utc[day]]);
  }
  for (const month of Object.keys(capture.monthly_utc).sort()) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`bad month ${month}`);
    if (month < capture.captured_on.slice(0, 7)) rows.push(["month", `${month}-01`, capture.monthly_utc[month]]);
  }
  for (const [, period, stars] of rows) if (!Number.isInteger(stars) || stars < 0) throw new Error(`bad value for ${period}`);

  const count = (g: string) => rows.filter((r) => r[0] === g);
  const sum = (g: string) => count(g).reduce((acc, r) => acc + r[2], 0);
  console.log(`${capture.source_name}: ${count("day").length} days (${sum("day")} stars), ${count("month").length} months (${sum("month")} stars)`);
  if (dryRun) return console.log("dry run, nothing written");

  const { getPool } = await import("../src/lib/db");
  const pool = getPool();
  await pool.query(
    `INSERT INTO external_star_gains (source, granularity, period_start, stars)
     SELECT $1, g, p::date, s FROM unnest($2::text[], $3::text[], $4::int[]) AS t(g, p, s)
     ON CONFLICT (source, granularity, period_start) DO UPDATE SET stars = EXCLUDED.stars, captured_at = now()`,
    [capture.source_name, rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2])],
  );
  await pool.end();
  console.log(`upserted ${rows.length} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
