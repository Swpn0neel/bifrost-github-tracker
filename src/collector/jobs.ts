import { GitHubClient } from "../lib/github";
import { env } from "../lib/env";
import { query, queryOne } from "../lib/db";
import { backfilledKey, fillTrendshiftHistory, snapshotTrackedRepos, syncTrackedRepos } from "./repos";
import { takeSnapshot } from "./snapshot";
import { getState, runSync, setState, type Log } from "./sync";

export type Trigger = "cron" | "manual";
export type JobStatus = "ok" | "partial" | "error";

export interface JobResult {
  runId: number;
  kind: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  apiCalls: number;
  detail: Record<string, unknown>;
  error?: string;
  log: string[];
}

interface JobContext {
  gh: GitHubClient;
  log: Log;
}

interface JobOutcome {
  detail: Record<string, unknown>;
  status?: JobStatus;
}

async function withRun(kind: string, triggeredBy: Trigger, fn: (ctx: JobContext) => Promise<JobOutcome>): Promise<JobResult> {
  const lines: string[] = [];
  const log: Log = (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    lines.push(line);
    console.log(line);
  };
  const gh = new GitHubClient({ token: env.githubToken, repo: env.repo, log });
  log(`${kind} run started (${triggeredBy}); token: ${gh.hasToken ? "yes" : "NO"}`);

  const run = await queryOne<{ id: number; started_at: Date }>(
    "INSERT INTO collector_runs (kind, triggered_by) VALUES ($1, $2) RETURNING id, started_at",
    [kind, triggeredBy],
  );
  if (!run) throw new Error("could not create collector_runs row");
  const startedAt = run.started_at;

  try {
    const { detail, status = "ok" } = await fn({ gh, log });
    const finishedAt = new Date();
    log(`${kind} finished: ${status} in ${finishedAt.getTime() - startedAt.getTime()}ms, ${gh.calls} API calls`);
    await query("UPDATE collector_runs SET status = $2, finished_at = $3, api_calls = $4, detail = $5 WHERE id = $1", [
      run.id,
      status,
      finishedAt,
      gh.calls,
      { ...detail, log: lines.slice(-80) },
    ]);
    return {
      runId: run.id,
      kind,
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      apiCalls: gh.calls,
      detail,
      log: lines,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date();
    log(`${kind} FAILED: ${message}`);
    await query(
      "UPDATE collector_runs SET status = 'error', finished_at = $2, api_calls = $3, error = $4, detail = $5 WHERE id = $1",
      [run.id, finishedAt, gh.calls, message, { log: lines.slice(-80) }],
    );
    return {
      runId: run.id,
      kind,
      status: "error",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      apiCalls: gh.calls,
      detail: {},
      error: message,
      log: lines,
    };
  }
}

/** The 4x/day job: snapshot the headline numbers, then pull new events. */
export function runSnapshotJob(triggeredBy: Trigger): Promise<JobResult> {
  return withRun("snapshot", triggeredBy, async ({ gh, log }) => {
    const snap = await takeSnapshot(gh, triggeredBy);
    const v = snap.values;
    log(
      `snapshot #${snap.id} ${snap.ist_date} slot ${snap.slot}: ${v.stars} stars, ${v.forks} forks, ` +
        `${v.open_issues} open issues, ${v.open_prs} open PRs, ${v.contributors ?? "?"} contributors`,
    );
    const snapshotDetail = { id: snap.id, ist_date: snap.ist_date, slot: snap.slot, ...v };
    // The Compare page's repos are read straight after, so their numbers sit close to this reading in time.
    const compare = await snapshotTrackedRepos(gh, log, triggeredBy);
    if (!gh.hasToken) {
      // 60 req/hr is not enough to walk event pages; the snapshot alone still works.
      log("no GITHUB_TOKEN: skipping event sync");
      return {
        status: "partial",
        detail: { snapshot: snapshotDetail, compare, sync: {}, syncErrors: ["event sync skipped: GITHUB_TOKEN not set"], rateRemaining: gh.rateRemaining },
      };
    }
    // Full stargazer re-walk once a day (the midnight run) so unstars are detected.
    const neverFullySynced = !(await getState("stars_full_synced_at"));
    const fullStars = (snap.slot === 0 && triggeredBy === "cron") || neverFullySynced;
    const sync = await runSync(gh, log, { repo: snap.repo, full: false, fullStars });
    // Compared repos' events come after the primary's, so a long backfill never delays Bifrost's own numbers.
    const compareSync = await syncTrackedRepos(gh, log, compare.snapshotted, { allowBackfill: triggeredBy === "cron" });
    // Outside history for a repo that still needs it: one page fetch each, and only while the import is due.
    const trendshift = await fillTrendshiftHistory(log);
    const compareDetail = { ...compare, events: compareSync, trendshift, errors: [...compare.errors, ...compareSync.errors, ...trendshift.errors] };
    return {
      status: sync.errors.length || compareDetail.errors.length ? "partial" : "ok",
      detail: { snapshot: snapshotDetail, compare: compareDetail, sync: sync.counts, syncErrors: sync.errors, rateRemaining: gh.rateRemaining },
    };
  });
}

/** One-time (or repair) walk of every event endpoint, for the primary repo or a compared one. Needs a token. */
export function runBackfillJob(triggeredBy: Trigger = "manual", repoName?: string): Promise<JobResult> {
  return withRun("backfill", triggeredBy, async ({ gh: primary, log }) => {
    if (!primary.hasToken) throw new Error("Backfill requires GITHUB_TOKEN: stargazer timestamps need an authenticated request.");
    const compared = repoName !== undefined && repoName.toLowerCase() !== env.repo.toLowerCase();
    const gh = compared ? primary.forRepo(repoName) : primary;
    const repo = await gh.repoInfo();
    log(`backfilling ${gh.fullName}: ${repo.stargazers_count} stars, ${repo.forks_count} forks, default branch ${repo.default_branch}`);
    const sync = await runSync(gh, log, { repo, full: true, fullStars: !compared });
    if (compared && sync.errors.length === 0) await setState(backfilledKey(gh.fullName), new Date().toISOString());
    return {
      status: sync.errors.length ? "partial" : "ok",
      detail: { repo: gh.fullName, sync: sync.counts, syncErrors: sync.errors, rateRemaining: gh.rateRemaining },
    };
  });
}

/**
 * Incremental event sync without a snapshot, for the primary repo or a compared one. For a
 * compared repo whose earlier load was cut short this finishes the job: steps without a saved
 * cursor are walked from the beginning, the others carry on from theirs.
 */
export function runSyncJob(triggeredBy: Trigger = "manual", repoName?: string): Promise<JobResult> {
  return withRun("sync", triggeredBy, async ({ gh: primary, log }) => {
    const compared = repoName !== undefined && repoName.toLowerCase() !== env.repo.toLowerCase();
    const gh = compared ? primary.forRepo(repoName) : primary;
    const repo = await gh.repoInfo();
    const sync = await runSync(gh, log, { repo, full: false, fullStars: false });
    if (compared && sync.errors.length === 0 && (await getState(backfilledKey(gh.fullName))) === null) {
      await setState(backfilledKey(gh.fullName), new Date().toISOString());
      log(`${gh.fullName}: event history complete`);
    }
    return {
      status: sync.errors.length ? "partial" : "ok",
      detail: { repo: gh.fullName, sync: sync.counts, syncErrors: sync.errors },
    };
  });
}
