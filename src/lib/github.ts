const API = "https://api.github.com";

export interface RepoInfo {
  stargazers_count: number;
  forks_count: number;
  subscribers_count: number;
  open_issues_count: number;
  size: number;
  default_branch: string;
  created_at: string;
  pushed_at: string;
  updated_at: string;
  has_discussions?: boolean;
}

export interface GitHubResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubClientOptions {
  token?: string;
  repo: string; // owner/name
  log?: (msg: string) => void;
}

type Params = Record<string, string | number | undefined>;

interface RequestOptions {
  params?: Params;
  accept?: string;
  method?: "GET" | "POST";
  body?: unknown;
}

interface PageOptions {
  params?: Params;
  accept?: string;
  startPage?: number;
  maxPages?: number;
  perPage?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseLastPage(link: string | null): number | null {
  if (!link) return null;
  const match = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return match ? Number(match[1]) : null;
}

/** The URL GitHub says to fetch next, from the Link header; null on the last page. */
export function parseNextUrl(link: string | null): string | null {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/** Counters shared by every client of one run, so a run's API-call total covers all the repos it touched. */
interface ClientState {
  calls: number;
  rateRemaining: number | null;
  rateReset: Date | null;
  /** Set when GitHub rejects the configured token; requests continue anonymously. */
  tokenRejected: boolean;
}

export class GitHubClient {
  readonly owner: string;
  readonly name: string;
  private readonly state: ClientState;

  constructor(
    private readonly opts: GitHubClientOptions,
    state?: ClientState,
  ) {
    const [owner, name] = opts.repo.split("/");
    if (!owner || !name) throw new Error(`GITHUB_REPO must be owner/name, got "${opts.repo}"`);
    this.owner = owner;
    this.name = name;
    this.state = state ?? { calls: 0, rateRemaining: null, rateReset: null, tokenRejected: false };
  }

  /** A client for another repository that shares this one's token, log and counters. */
  forRepo(repo: string): GitHubClient {
    return new GitHubClient({ ...this.opts, repo }, this.state);
  }

  get calls(): number {
    return this.state.calls;
  }

  get rateRemaining(): number | null {
    return this.state.rateRemaining;
  }

  get rateReset(): Date | null {
    return this.state.rateReset;
  }

  get tokenRejected(): boolean {
    return this.state.tokenRejected;
  }

  get hasToken(): boolean {
    return Boolean(this.opts.token) && !this.state.tokenRejected;
  }

  get fullName(): string {
    return `${this.owner}/${this.name}`;
  }

  repoPath(sub = ""): string {
    return `/repos/${this.owner}/${this.name}${sub}`;
  }

  async request<T>(path: string, { params, accept, method = "GET", body }: RequestOptions = {}): Promise<GitHubResponse<T>> {
    const url = new URL(path.startsWith("http") ? path : API + path);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      Accept: accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bifrost-github-tracker",
    };
    if (this.hasToken) headers.Authorization = `Bearer ${this.opts.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    for (let attempt = 1; ; attempt++) {
      this.state.calls++;
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

      // A revoked or mistyped token would otherwise kill every run; fall back to
      // anonymous access (60 req/hr) so the headline snapshot still gets taken.
      if (res.status === 401 && this.hasToken) {
        this.state.tokenRejected = true;
        delete headers.Authorization;
        this.opts.log?.("GitHub rejected GITHUB_TOKEN (401 Bad credentials); continuing unauthenticated at 60 req/hr");
        continue;
      }
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining !== null) this.state.rateRemaining = Number(remaining);
      const reset = res.headers.get("x-ratelimit-reset");
      if (reset) this.state.rateReset = new Date(Number(reset) * 1000);

      if (res.ok) {
        const data = (res.status === 204 ? null : await res.json()) as T;
        return { data, headers: res.headers, status: res.status };
      }

      const text = await res.text();
      const rateLimited = res.status === 429 || (res.status === 403 && (res.headers.has("retry-after") || remaining === "0"));
      const retryable = rateLimited || res.status >= 500;
      if (!retryable || attempt >= 5) {
        throw new GitHubError(`GitHub ${method} ${url.pathname} failed: ${res.status} ${text.slice(0, 300)}`, res.status, text);
      }
      let waitMs = 2 ** attempt * 1000;
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) waitMs = Number(retryAfter) * 1000;
      else if (remaining === "0" && this.state.rateReset) waitMs = Math.max(1000, this.state.rateReset.getTime() - Date.now() + 1000);
      waitMs = Math.min(waitMs, 5 * 60_000);
      this.opts.log?.(`GitHub ${res.status} on ${url.pathname}; retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt})`);
      await sleep(waitMs);
    }
  }

  /**
   * Iterate a paginated list endpoint. Yields one page at a time. The first request
   * names its page; after that the Link header's "next" URL is followed as given, since
   * on large datasets GitHub replaces page numbers with cursors ("after=") and rejects
   * page= past roughly the 10,000th row with a 422.
   */
  async *pages<T>(
    path: string,
    { params = {}, accept, startPage = 1, maxPages = Number.POSITIVE_INFINITY, perPage = 100 }: PageOptions = {},
  ): AsyncGenerator<{ page: number; items: T[]; lastPage: number | null }> {
    let page = startPage;
    let lastPage: number | null = null;
    let next: string | null = null;
    while (page - startPage < maxPages) {
      const { data, headers } = next
        ? await this.request<T[]>(next, { accept })
        : await this.request<T[]>(path, { params: { ...params, per_page: perPage, page }, accept });
      const link = headers.get("link");
      const last = parseLastPage(link);
      if (last !== null) lastPage = last;
      yield { page, items: data, lastPage };
      next = parseNextUrl(link);
      if (!next || data.length === 0) break;
      page++;
    }
  }

  /** Total item count of a list endpoint via the Link: rel="last" trick (1 request). */
  async countViaLink(path: string, params: Params = {}): Promise<number> {
    const { data, headers } = await this.request<unknown[]>(path, { params: { ...params, per_page: 1 } });
    const last = parseLastPage(headers.get("link"));
    return last ?? data.length;
  }

  async repoInfo(): Promise<RepoInfo> {
    const { data } = await this.request<RepoInfo>(this.repoPath());
    return data;
  }

  async searchCount(qualifiers: string): Promise<number> {
    const q = `repo:${this.owner}/${this.name} ${qualifiers}`;
    const { data } = await this.request<{ total_count: number }>("/search/issues", {
      params: { q, per_page: 1, advanced_search: "true" },
    });
    return data.total_count;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!this.opts.token) throw new GitHubError("GraphQL requires a token", 401);
    const { data } = await this.request<{ data: T; errors?: { message: string }[] }>(`${API}/graphql`, {
      method: "POST",
      body: { query, variables },
    });
    if (data.errors?.length) throw new GitHubError(data.errors.map((e) => e.message).join("; "), 200);
    return data.data;
  }

  /** Discussions count is only exposed via GraphQL; returns null without a token. */
  async discussionsCount(): Promise<number | null> {
    if (!this.opts.token) return null;
    try {
      const result = await this.graphql<{ repository: { discussions: { totalCount: number } } }>(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions { totalCount } } }`,
        { owner: this.owner, name: this.name },
      );
      return result.repository.discussions.totalCount;
    } catch (err) {
      this.opts.log?.(`discussions count failed: ${(err as Error).message}`);
      return null;
    }
  }
}
