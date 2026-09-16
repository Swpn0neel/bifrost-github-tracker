import { GitHubClient, type RepoInfo } from "../lib/github";
import { queryOne } from "../lib/db";
import { istDate, istSlot, type Slot } from "../lib/time";

export interface SnapshotValues {
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
  size_kb: number;
}

export interface SnapshotResult {
  id: number;
  captured_at: Date;
  ist_date: string;
  slot: Slot;
  values: SnapshotValues;
  repo: RepoInfo;
}

/**
 * Gather every headline number in ~12 requests. Search calls run sequentially
 * because GitHub's secondary rate limit dislikes concurrent search requests.
 */
export async function collectSnapshotValues(gh: GitHubClient): Promise<{ values: SnapshotValues; repo: RepoInfo }> {
  const repo = await gh.repoInfo();

  const open_issues = await gh.searchCount("is:issue is:open");
  const closed_issues = await gh.searchCount("is:issue is:closed");
  const open_prs = await gh.searchCount("is:pr is:open");
  const merged_prs = await gh.searchCount("is:pr is:merged");
  const closed_prs = await gh.searchCount("is:pr is:closed is:unmerged");

  const contributors = await gh.countViaLink(gh.repoPath("/contributors"), { anon: "false" });
  const commits = await gh.countViaLink(gh.repoPath("/commits"), { sha: repo.default_branch });
  const releases = await gh.countViaLink(gh.repoPath("/releases"));
  const discussions = await gh.discussionsCount();

  return {
    repo,
    values: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.subscribers_count,
      open_issues,
      closed_issues,
      open_prs,
      merged_prs,
      closed_prs,
      contributors,
      commits,
      releases,
      discussions,
      size_kb: repo.size,
    },
  };
}

export async function takeSnapshot(gh: GitHubClient, triggeredBy: string): Promise<SnapshotResult> {
  const { values, repo } = await collectSnapshotValues(gh);
  const captured_at = new Date();
  const ist_date = istDate(captured_at);
  const slot = istSlot(captured_at);
  const raw = {
    default_branch: repo.default_branch,
    pushed_at: repo.pushed_at,
    open_issues_count: repo.open_issues_count,
    rate_remaining: gh.rateRemaining,
  };
  const row = await queryOne<{ id: number }>(
    `INSERT INTO snapshots (
       captured_at, ist_date, slot, triggered_by,
       stars, forks, watchers, open_issues, closed_issues, open_prs, merged_prs, closed_prs,
       contributors, commits, releases, discussions, size_kb, raw
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      captured_at,
      ist_date,
      slot,
      triggeredBy,
      values.stars,
      values.forks,
      values.watchers,
      values.open_issues,
      values.closed_issues,
      values.open_prs,
      values.merged_prs,
      values.closed_prs,
      values.contributors,
      values.commits,
      values.releases,
      values.discussions,
      values.size_kb,
      raw,
    ],
  );
  if (!row) throw new Error("snapshot insert returned no row");
  return { id: row.id, captured_at, ist_date, slot, values, repo };
}
