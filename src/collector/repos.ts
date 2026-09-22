// Snapshots for the repositories on the Compare page. They get headline counts
// only (no event tables): one GraphQL request for the counts plus two REST
// requests for the numbers GraphQL cannot give (contributors; releases, which
// GraphQL caps at 1,000).
import { GitHubClient, GitHubError } from "../lib/github";
import { query, queryOne } from "../lib/db";
import type { Log } from "./sync";
import { istDate, istSlot } from "../lib/time";

export interface RepoFacts {
  github_id: number | null;
  /** owner/name as GitHub spells it (follows renames and redirects). */
  full_name: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  created_at: string | null;
  is_archived: boolean;
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

export interface TrackedRepoSnapshotResult {
  snapshotted: string[];
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
      result.snapshotted.push(facts.full_name);
      log(`compare ${facts.full_name}: snapshot #${snap.id}, ${counts.stars} stars, ${counts.forks} forks, ${counts.open_issues} open issues, ${counts.open_prs} open PRs`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${repo.full_name}: ${message}`);
      log(`compare ${repo.full_name} FAILED: ${message}`);
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
