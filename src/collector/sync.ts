import { GitHubClient, type RepoInfo } from "../lib/github";
import { query, queryOne } from "../lib/db";

export type Log = (msg: string) => void;

export interface SyncOptions {
  repo: RepoInfo;
  /** Re-walk every page of every endpoint (backfill). */
  full: boolean;
  /** Re-walk all stargazer pages so unstars get detected. */
  fullStars: boolean;
}

export interface SyncResult {
  counts: Record<string, number>;
  errors: string[];
}

const STAR_ACCEPT = "application/vnd.github.star+json";
const CHUNK = 500;

// --- sync_state cursors -----------------------------------------------------

export async function getState(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>("SELECT value FROM sync_state WHERE key = $1", [key]);
  return row?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

// --- generic batched upsert -------------------------------------------------

async function upsert(table: string, columns: string[], rows: unknown[][], conflictKey: string): Promise<number> {
  if (rows.length === 0) return 0;
  const updateCols = columns.filter((c) => c !== conflictKey);
  const setClause = updateCols.length
    ? `DO UPDATE SET ${updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`
    : "DO NOTHING";
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map(
      (row) =>
        `(${row
          .map((value) => {
            params.push(value);
            return `$${params.length}`;
          })
          .join(",")})`,
    );
    await query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT (${conflictKey}) ${setClause}`,
      params,
    );
  }
  return rows.length;
}

// --- issues + pull requests -------------------------------------------------

interface IssueItem {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
  comments: number;
  user: { login: string } | null;
  labels: { name: string }[];
  pull_request?: { merged_at: string | null };
}

const ISSUE_COLUMNS = ["number", "is_pr", "title", "author", "state", "created_at", "closed_at", "merged_at", "labels", "comments", "updated_at"];

export async function syncIssues(gh: GitHubClient, log: Log, full: boolean): Promise<number> {
  const since = full ? null : await getState("issues_since");
  const params: Record<string, string> = { state: "all", sort: "updated", direction: "asc" };
  if (since) params.since = since;
  let total = 0;
  let maxUpdated = since ?? "";
  for await (const { page, items, lastPage } of gh.pages<IssueItem>(gh.repoPath("/issues"), { params })) {
    const rows = items.map((it) => [
      it.number,
      Boolean(it.pull_request),
      it.title,
      it.user?.login ?? null,
      it.state,
      it.created_at,
      it.closed_at,
      it.pull_request?.merged_at ?? null,
      it.labels.map((l) => l.name),
      it.comments,
      it.updated_at,
    ]);
    total += await upsert("issues", ISSUE_COLUMNS, rows, "number");
    for (const it of items) if (it.updated_at > maxUpdated) maxUpdated = it.updated_at;
    if (full || page % 10 === 0) log(`issues page ${page}/${lastPage ?? "?"} (${total} rows)`);
  }
  if (maxUpdated) await setState("issues_since", maxUpdated);
  return total;
}

// --- commits on the default branch -----------------------------------------

interface CommitItem {
  sha: string;
  author: { login: string } | null;
  commit: {
    author: { name: string; date: string } | null;
    committer: { name: string; date: string } | null;
    message: string;
  };
}

const COMMIT_COLUMNS = ["sha", "author_login", "author_name", "committed_at", "message"];

export async function syncCommits(gh: GitHubClient, log: Log, branch: string, full: boolean): Promise<number> {
  const since = full ? null : await getState("commits_since");
  const params: Record<string, string> = { sha: branch };
  if (since) params.since = since;
  let total = 0;
  let maxCommitted = since ?? "";
  for await (const { page, items, lastPage } of gh.pages<CommitItem>(gh.repoPath("/commits"), { params })) {
    const rows: unknown[][] = [];
    for (const it of items) {
      // Committer date is when it landed on the branch (rebases/squashes keep author dates in the past).
      const date = it.commit.committer?.date ?? it.commit.author?.date;
      if (!date) continue;
      rows.push([it.sha, it.author?.login ?? null, it.commit.author?.name ?? null, date, it.commit.message.split("\n")[0].slice(0, 200)]);
      if (date > maxCommitted) maxCommitted = date;
    }
    total += await upsert("commits", COMMIT_COLUMNS, rows, "sha");
    if (full || page % 10 === 0) log(`commits page ${page}/${lastPage ?? "?"} (${total} rows)`);
  }
  if (maxCommitted) await setState("commits_since", maxCommitted);
  return total;
}

// --- stargazers -------------------------------------------------------------

interface StarItem {
  starred_at: string;
  user: { login: string } | null;
}

const STAR_COLUMNS = ["login", "starred_at", "unstarred_at"];

/**
 * Stargazers are listed oldest-first, so new stars land on the last pages.
 * Incremental mode re-reads the tail; full mode re-reads everything and marks
 * logins that disappeared as unstarred.
 */
export async function syncStargazers(gh: GitHubClient, log: Log, full: boolean): Promise<number> {
  const path = gh.repoPath("/stargazers");
  if (full) {
    const seen: string[] = [];
    for await (const { page, items, lastPage } of gh.pages<StarItem>(path, { accept: STAR_ACCEPT })) {
      const rows = items.filter((it) => it.user?.login).map((it) => [it.user!.login, it.starred_at, null]);
      await upsert("stargazers", STAR_COLUMNS, rows, "login");
      for (const r of rows) seen.push(r[0] as string);
      if (page % 20 === 0 || page === lastPage) log(`stargazers page ${page}/${lastPage ?? "?"} (${seen.length} rows)`);
    }
    const gone = await query<{ login: string }>(
      `UPDATE stargazers SET unstarred_at = now()
       WHERE unstarred_at IS NULL AND NOT (login = ANY($1::text[])) RETURNING login`,
      [seen],
    );
    if (gone.length) log(`stargazers: marked ${gone.length} as unstarred`);
    await setState("stars_full_synced_at", new Date().toISOString());
    return seen.length;
  }

  const known = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM stargazers WHERE unstarred_at IS NULL");
  // Start a page early so a handful of unstars since the last full sync can't hide new stars.
  const startPage = Math.max(1, Math.floor((known?.n ?? 0) / 100) - 1);
  let total = 0;
  for await (const { items } of gh.pages<StarItem>(path, { accept: STAR_ACCEPT, startPage })) {
    const rows = items.filter((it) => it.user?.login).map((it) => [it.user!.login, it.starred_at, null]);
    total += await upsert("stargazers", STAR_COLUMNS, rows, "login");
  }
  log(`stargazers: re-read from page ${startPage}, ${total} rows touched`);
  return total;
}

// --- forks ------------------------------------------------------------------

interface ForkItem {
  id: number;
  owner: { login: string } | null;
  created_at: string;
}

export async function syncForks(gh: GitHubClient, log: Log, full: boolean): Promise<number> {
  let total = 0;
  for await (const { page, items, lastPage } of gh.pages<ForkItem>(gh.repoPath("/forks"), { params: { sort: "newest" } })) {
    const ids = items.map((it) => it.id);
    const known = full
      ? []
      : await query<{ fork_id: number }>("SELECT fork_id FROM forks WHERE fork_id = ANY($1::bigint[])", [ids]);
    total += await upsert(
      "forks",
      ["fork_id", "owner", "created_at"],
      items.map((it) => [it.id, it.owner?.login ?? null, it.created_at]),
      "fork_id",
    );
    if (full && page % 5 === 0) log(`forks page ${page}/${lastPage ?? "?"} (${total} rows)`);
    if (!full && known.length === items.length) break; // reached already-known territory
  }
  return total;
}

// --- releases ---------------------------------------------------------------

interface ReleaseItem {
  id: number;
  tag_name: string;
  name: string | null;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
}

export async function syncReleases(gh: GitHubClient, log: Log, full: boolean): Promise<number> {
  let total = 0;
  for await (const { page, items, lastPage } of gh.pages<ReleaseItem>(gh.repoPath("/releases"))) {
    const ids = items.map((it) => it.id);
    const known = full
      ? []
      : await query<{ release_id: number }>("SELECT release_id FROM releases WHERE release_id = ANY($1::bigint[])", [ids]);
    total += await upsert(
      "releases",
      ["release_id", "tag", "name", "prerelease", "draft", "published_at"],
      items.map((it) => [it.id, it.tag_name, it.name, it.prerelease, it.draft, it.published_at]),
      "release_id",
    );
    if (full && page % 5 === 0) log(`releases page ${page}/${lastPage ?? "?"} (${total} rows)`);
    if (!full && known.length === items.length) break;
  }
  return total;
}

// --- orchestrator -----------------------------------------------------------

export async function runSync(gh: GitHubClient, log: Log, opts: SyncOptions): Promise<SyncResult> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      counts[name] = await fn();
      log(`${name}: ${counts[name]} rows (${gh.calls} API calls so far, ${gh.rateRemaining ?? "?"} remaining)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: ${message}`);
      log(`${name} FAILED: ${message}`);
    }
  };
  await step("issues", () => syncIssues(gh, log, opts.full));
  await step("commits", () => syncCommits(gh, log, opts.repo.default_branch, opts.full));
  await step("stargazers", () => syncStargazers(gh, log, opts.full || opts.fullStars));
  await step("forks", () => syncForks(gh, log, opts.full));
  await step("releases", () => syncReleases(gh, log, opts.full));
  return { counts, errors };
}
