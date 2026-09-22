// CLI entry point used by the Railway cron service and for local runs:
//   npm run collect   -> snapshot + incremental sync (the 4x/day job)
//   npm run sync [owner/name] -> incremental sync only, of the primary repo or a compared one
//   npm run backfill [owner/name] -> full history walk of the primary repo, or of a compared one (needs GITHUB_TOKEN)
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  // Real environment variables win over the file, so this is a no-op on Railway.
  process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
  const kind = process.argv[2] ?? "snapshot";
  // Imported after env is loaded so nothing reads process.env too early.
  const jobs = await import("./jobs");
  const result =
    kind === "snapshot"
      ? await jobs.runSnapshotJob("cron")
      : kind === "sync"
        ? await jobs.runSyncJob("manual", process.argv[3])
        : kind === "backfill"
          ? await jobs.runBackfillJob("manual", process.argv[3])
          : null;
  if (!result) {
    console.error(`Unknown job "${kind}". Use snapshot | sync | backfill.`);
    process.exit(2);
  }
  console.log(JSON.stringify({ ...result, log: undefined }, null, 2));
  process.exit(result.status === "error" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
