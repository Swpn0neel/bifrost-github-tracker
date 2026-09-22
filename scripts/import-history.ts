// Import activity per period from an outside source (Trendshift) into external_gains,
// for the days and months before a repository's first reading.
//
//   npm run import:history -- --trendshift <id or URL> [--repo owner/name] [--save capture.json] [--dry-run]
//   npm run import:history -- capture.json [--dry-run]
//
// With --trendshift the repository page is fetched once (see src/lib/trendshift.ts); --save
// keeps that capture as a file, and a saved capture can be imported later by path. The
// Trendshift id is remembered on the tracked repo, so the collector can fill in the day the
// repo was added once that day has ended. Re-running is safe: rows are replaced.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main(): Promise<void> {
  const { captureRows, fetchTrendshift, importCapture, parseTrendshiftInput } = await import("../src/lib/trendshift");
  type Capture = Awaited<ReturnType<typeof fetchTrendshift>>;

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
    const id = parseTrendshiftInput(trendshift);
    if (id === null) throw new Error("--trendshift takes the numeric id or the trendshift.io/repositories/<id> URL");
    capture = await fetchTrendshift(id, flag("--repo"));
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

  const rows = captureRows(capture);
  const count = (g: string) => rows.filter((r) => r[0] === g);
  const sum = (g: string, k: "stars" | "forks") => count(g).reduce((acc, r) => acc + (r[2][k] ?? 0), 0);
  console.log(
    `${capture.repo} from ${capture.source_name}: ${count("day").length} days (${sum("day", "stars")} stars, ${sum("day", "forks")} forks), ` +
      `${count("month").length} months (${sum("month", "stars")} stars, ${sum("month", "forks")} forks)`,
  );
  if (dryRun) return console.log("dry run, nothing written");

  const summary = await importCapture(capture);
  console.log(`upserted ${summary.days + summary.months} rows${capture.trendshift_id ? ` and linked Trendshift #${capture.trendshift_id}` : ""}`);
  const { getPool } = await import("../src/lib/db");
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
