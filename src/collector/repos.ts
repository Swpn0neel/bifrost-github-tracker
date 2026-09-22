// Snapshots for the repositories on the Compare page. They get headline counts
// only (no event tables): one GraphQL request for the counts plus two REST
// requests for the numbers GraphQL cannot give (contributors; releases, which
// GraphQL caps at 1,000).
import { GitHubClient, GitHubError } from "../lib/github";
import { query, queryOne } from "../lib/db";
import { getState, runSync, setState, type Log } from "./sync";
import { daysBetween, istDate, istSlot } from "../lib/time";
import { fetchTrendshift, importCapture } from "../lib/trendshift";

export interface RepoFacts {
  github_id: number | null;
  /** owner/name as GitHub spells it (follows renames and redirects). */
  full_name: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  created_at: string | null;
  is_archived: boolean;
  default_branch: string | null;
}

export interface RepoCounts {
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

interface GqlRepo {
  databaseId: number | null;
  nameWithOwner: string;
  description: string | null;
  homepageUrl: string | null;
  isArchived: boolean;
  createdAt: string;
  diskUsage: number | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  openIssues: { totalCount: number };
  closedIssues: { totalCount: number };
  openPRs: { totalCount: number };
  mergedPRs: { totalCount: number };
  closedPRs: { totalCount: number };
  discussions: { totalCount: number };
  defaultBranchRef: { name: string; target: { history?: { totalCount: number } } | null } | null;
}

const COUNTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner description homepageUrl isArchived createdAt diskUsage
    primaryLanguage { name }
    stargazerCount forkCount
    watchers { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    openPRs: pullRequests(states: OPEN) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    discussions { totalCount }
    defaultBranchRef { name target { ... on Commit { history { totalCount } } } }
  }
}`;

export class RepoNotFoundError extends Error {
  constructor(repo: string) {
    super(`${repo} is not a public GitHub repository (or the token cannot see it)`);
    this.name = "RepoNotFoundError";
  }
}

/** A count that is nice to have: a repo too big for GitHub's contributors endpoint just reports null. */
async function countOrNull(log: Log, what: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (err) {
    log(`${what} count failed: ${(err as Error).message}`);
    return null;
  }
}

/** Every headline number for the client's repository, in three requests. Needs a token (GraphQL). */
export async function fetchRepo(gh: GitHubClient, log: Log): Promise<{ facts: RepoFacts; counts: RepoCounts }> {
  let data: { repository: GqlRepo | null };
  try {
    data = await gh.graphql<{ repository: GqlRepo | null }>(COUNTS_QUERY, { owner: gh.owner, name: gh.name });
  } catch (err) {
    if (err instanceof GitHubError && /Could not resolve to a Repository/i.test(err.message)) throw new RepoNotFoundError(gh.fullName);
    throw err;
  }
  const r = data.repository;
  if (!r) throw new RepoNotFoundError(gh.fullName);

  const contributors = await countOrNull(log, `${r.nameWithOwner} contributors`, () => gh.countViaLink(gh.repoPath("/contributors"), { anon: "false" }));
  const releases = await countOrNull(log, `${r.nameWithOwner} releases`, () => gh.countViaLink(gh.repoPath("/releases")));

  return {
    facts: {
      github_id: r.databaseId,
      full_name: r.nameWithOwner,
      description: r.description,
      homepage: r.homepageUrl || null,
      language: r.primaryLanguage?.name ?? null,
      created_at: r.createdAt,
      is_archived: r.isArchived,
      default_branch: r.defaultBranchRef?.name ?? null,
    },
    counts: {
      stars: r.stargazerCount,
      forks: r.forkCount,
      watchers: r.watchers.totalCount,
      open_issues: r.openIssues.totalCount,
      closed_issues: r.closedIssues.totalCount,
      open_prs: r.openPRs.totalCount,
      merged_prs: r.mergedPRs.totalCount,
      closed_prs: r.closedPRs.totalCount,
      contributors,
      commits: r.defaultBranchRef?.target?.history?.totalCount ?? null,
      releases,
      discussions: r.discussions.totalCount,
      size_kb: r.diskUsage,
    },
  };
}

/** Store one reading and keep the repo's descriptive fields current. */
export async function storeRepoSnapshot(repoId: number, facts: RepoFacts, counts: RepoCounts, triggeredBy: string): Promise<{ id: number; captured_at: Date }> {
  const captured_at = new Date();
  const row = await queryOne<{ id: number }>(
    `INSERT INTO repo_snapshots (
       repo_id, captured_at, ist_date, slot, triggered_by,
       stars, forks, watchers, open_issues, closed_issues, open_prs, merged_prs, closed_prs,
       contributors, commits, releases, discussions, size_kb
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      repoId,
      captured_at,
      istDate(captured_at),
      istSlot(captured_at),
      triggeredBy,
      counts.stars,
      counts.forks,
      counts.watchers,
      counts.open_issues,
      counts.closed_issues,
      counts.open_prs,
      counts.merged_prs,
      counts.closed_prs,
      counts.contributors,
      counts.commits,
      counts.releases,
      counts.discussions,
      counts.size_kb,
    ],
  );
  if (!row) throw new Error("repo snapshot insert returned no row");
  await query(
    `UPDATE tracked_repos
     SET full_name = $2, github_id = $3, description = $4, homepage = $5, language = $6, repo_created_at = $7
     WHERE id = $1`,
    [repoId, facts.full_name, facts.github_id, facts.description, facts.homepage, facts.language, facts.created_at],
  );
  return { id: row.id, captured_at };
}

export interface SnapshottedRepo {
  id: number;
  full_name: string;
  default_branch: string | null;
}

export interface TrackedRepoSnapshotResult {
  snapshotted: SnapshottedRepo[];
  errors: string[];
}

/** One reading for every repo on the Compare page. A failing repo is logged and skipped; the others still get theirs. */
export async function snapshotTrackedRepos(gh: GitHubClient, log: Log, triggeredBy: string): Promise<TrackedRepoSnapshotResult> {
  const result: TrackedRepoSnapshotResult = { snapshotted: [], errors: [] };
  const repos = await query<{ id: number; full_name: string }>("SELECT id, full_name FROM tracked_repos WHERE removed_at IS NULL ORDER BY id");
  if (repos.length === 0) return result;
  if (!gh.hasToken) {
    result.errors.push("compare repos skipped: GITHUB_TOKEN is needed for their GraphQL counts");
    log(result.errors[0]);
    return result;
  }
  for (const repo of repos) {
    try {
      const client = gh.forRepo(repo.full_name);
      const { facts, counts } = await fetchRepo(client, log);
      const snap = await storeRepoSnapshot(repo.id, facts, counts, triggeredBy);
      result.snapshotted.push({ id: repo.id, full_name: facts.full_name, default_branch: facts.default_branch });
      log(`compare ${facts.full_name}: snapshot #${snap.id}, ${counts.stars} stars, ${counts.forks} forks, ${counts.open_issues} open issues, ${counts.open_prs} open PRs`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${repo.full_name}: ${message}`);
      log(`compare ${repo.full_name} FAILED: ${message}`);
    }
  }
  return result;
}

export const backfilledKey = (repo: string) => `events_backfilled_at:${repo}`;

export interface TrackedRepoSyncResult {
  synced: string[];
  /** The repo whose full history was loaded in this run, if any. */
  backfilled: string | null;
  /** Repos still waiting for their full load (one per cron run, and never in a manual run). */
  waiting: string[];
  errors: string[];
}

/**
 * Event history for the compared repos: an incremental sync for each one already loaded,
 * and one initial load per cron run for a repo that is not yet (loading a large repo takes
 * minutes, so manual refreshes leave it to the schedule).
 *
 * The initial load is the incremental sync too: with no cursor saved it walks each endpoint
 * from the beginning, and a step that failed last time (its cursor never saved) is simply
 * walked again next run while the steps that succeeded carry on from their cursors.
 */
export async function syncTrackedRepos(gh: GitHubClient, log: Log, repos: SnapshottedRepo[], { allowBackfill }: { allowBackfill: boolean }): Promise<TrackedRepoSyncResult> {
  const result: TrackedRepoSyncResult = { synced: [], backfilled: null, waiting: [], errors: [] };
  for (const repo of repos) {
    if (!repo.default_branch) {
      result.errors.push(`${repo.full_name}: no default branch (empty repository?)`);
      continue;
    }
    const covered = (await getState(backfilledKey(repo.full_name))) !== null;
    if (!covered && (!allowBackfill || result.backfilled)) {
      result.waiting.push(repo.full_name);
      continue;
    }
    const client = gh.forRepo(repo.full_name);
    log(`compare ${repo.full_name}: ${covered ? "incremental event sync" : "initial event load"}`);
    const sync = await runSync(client, log, { repo: { default_branch: repo.default_branch }, full: false, fullStars: false });
    for (const e of sync.errors) result.errors.push(`${repo.full_name} ${e}`);
    if (covered) result.synced.push(repo.full_name);
    else if (sync.errors.length === 0) {
      await setState(backfilledKey(repo.full_name), new Date().toISOString());
      result.backfilled = repo.full_name;
    }
  }
  if (result.waiting.length) log(`compare: ${result.waiting.join(", ")} still waiting for a full event backfill (next cron run)`);
  return result;
}

/**
 * Whether a repo's outside history needs (another) import. The source publishes a day only
 * once it has ended (UTC), so the day a repo was added, whose gain our readings cannot
 * measure (there is no earlier reading), is fetched by the first run after that day; after
 * it our readings cover every day and the source is not consulted again.
 */
export function trendshiftImportDue(firstReadingDay: string | null, lastImportedDay: string | null, todayUtc: string): "initial" | "fill" | null {
  if (lastImportedDay === null) return "initial";
  if (firstReadingDay === null || lastImportedDay >= firstReadingDay) return null;
  // The day should be published the next day; a source that has not caught up after a few days is left alone.
  const since = daysBetween(firstReadingDay, todayUtc);
  return since >= 1 && since <= TRENDSHIFT_FILL_DAYS ? "fill" : null;
}

/** How many days after a repo's first reading the scheduled runs keep trying to fetch that day from Trendshift. */
export const TRENDSHIFT_FILL_DAYS = 3;

export interface TrendshiftFillResult {
  imported: string[];
  errors: string[];
}

/** One page fetch per compared repo that still needs its outside history (see trendshiftImportDue). */
export async function fillTrendshiftHistory(log: Log): Promise<TrendshiftFillResult> {
  const result: TrendshiftFillResult = { imported: [], errors: [] };
  const repos = await query<{ id: number; full_name: string; trendshift_id: number; first_day: string | null; last_day: string | null }>(
    `SELECT t.id, t.full_name, t.trendshift_id,
       (SELECT min(ist_date)::text FROM repo_snapshots s WHERE s.repo_id = t.id) AS first_day,
       (SELECT max(period_start)::text FROM external_gains g WHERE g.repo = t.full_name AND g.source = 'trendshift' AND g.granularity = 'day') AS last_day
     FROM tracked_repos t WHERE t.removed_at IS NULL AND t.trendshift_id IS NOT NULL ORDER BY t.id`,
  );
  const todayUtc = new Date().toISOString().slice(0, 10);
  for (const repo of repos) {
    const due = trendshiftImportDue(repo.first_day, repo.last_day, todayUtc);
    if (!due) continue;
    try {
      const capture = await fetchTrendshift(repo.trendshift_id, repo.full_name);
      const summary = await importCapture(capture);
      result.imported.push(repo.full_name);
      log(`compare ${repo.full_name}: ${due === "initial" ? "history" : `day ${repo.first_day}`} from Trendshift: ${summary.days} days, ${summary.months} months (through ${summary.lastDay ?? "—"})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${repo.full_name} trendshift: ${message}`);
      log(`compare ${repo.full_name} Trendshift import FAILED: ${message}`);
    }
  }
  return result;
}

/** "owner/name", a github.com URL, or a pasted ".git" address -> "owner/name"; null when it is none of those. */
export function parseRepoInput(input: string): string | null {
  let s = input.trim().replace(/^@/, "");
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  s = s.replace(/^git@github\.com:/i, "");
  const parts = s.split(/[/?#]/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..") return null;
  return `${owner}/${name}`;
}
