-- Bifrost GitHub tracker schema. Idempotent; safe to re-run.
-- All timestamps are stored in UTC (timestamptz). IST bucketing happens in queries
-- via AT TIME ZONE 'Asia/Kolkata'.

-- One row per collector run (4x/day cron + manual refreshes).
CREATE TABLE IF NOT EXISTS snapshots (
  id            bigserial PRIMARY KEY,
  captured_at   timestamptz NOT NULL,
  ist_date      date        NOT NULL,                       -- calendar date in IST
  slot          smallint    NOT NULL CHECK (slot IN (0,6,12,18)), -- IST 6-hour window start
  triggered_by  text        NOT NULL DEFAULT 'cron',
  stars         integer NOT NULL,
  forks         integer NOT NULL,
  watchers      integer NOT NULL,
  open_issues   integer NOT NULL,
  closed_issues integer NOT NULL,
  open_prs      integer NOT NULL,
  merged_prs    integer NOT NULL,
  closed_prs    integer NOT NULL,                           -- closed without merge
  contributors  integer,
  commits       integer,                                    -- on default branch
  releases      integer,
  discussions   integer,
  size_kb       integer,
  raw           jsonb
);
CREATE INDEX IF NOT EXISTS snapshots_date_slot_idx ON snapshots (ist_date, slot, captured_at);
CREATE INDEX IF NOT EXISTS snapshots_captured_idx  ON snapshots (captured_at);

-- Event tables, filled by backfill + incremental sync. These let us reconstruct
-- history before the tracker existed and bucket activity into 6-hour slots.
-- Every row names its repository (owner/name): the primary repo and the ones on
-- the Compare page share these tables. The default is the primary repo, so rows
-- written before the column existed, and by older code, land there.
CREATE TABLE IF NOT EXISTS stargazers (
  repo         text NOT NULL DEFAULT 'maximhq/bifrost',
  login        text NOT NULL,
  starred_at   timestamptz NOT NULL,
  unstarred_at timestamptz,                                 -- set when a full sync no longer sees the login
  PRIMARY KEY (repo, login)
);
ALTER TABLE stargazers ADD COLUMN IF NOT EXISTS unstarred_at timestamptz;
ALTER TABLE stargazers ADD COLUMN IF NOT EXISTS repo text NOT NULL DEFAULT 'maximhq/bifrost';
CREATE INDEX IF NOT EXISTS stargazers_starred_idx ON stargazers (starred_at);
CREATE INDEX IF NOT EXISTS stargazers_repo_starred_idx ON stargazers (repo, starred_at);

-- Star gains per period from an outside source, for history the tracker cannot
-- measure itself (the stargazer list is closed to our token). Periods are UTC
-- calendar days or months. Our own snapshots always take precedence.
CREATE TABLE IF NOT EXISTS external_star_gains (
  source       text NOT NULL,                               -- e.g. 'trendshift'
  granularity  text NOT NULL CHECK (granularity IN ('day','month')),
  period_start date NOT NULL,                               -- UTC; first day of the month for 'month'
  stars        integer NOT NULL CHECK (stars >= 0),
  captured_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, granularity, period_start)
);

CREATE TABLE IF NOT EXISTS forks (
  repo       text NOT NULL DEFAULT 'maximhq/bifrost',
  fork_id    bigint PRIMARY KEY,                            -- GitHub ids are global, so the id alone is the key
  owner      text,
  created_at timestamptz NOT NULL
);
ALTER TABLE forks ADD COLUMN IF NOT EXISTS repo text NOT NULL DEFAULT 'maximhq/bifrost';
CREATE INDEX IF NOT EXISTS forks_created_idx ON forks (created_at);
CREATE INDEX IF NOT EXISTS forks_repo_created_idx ON forks (repo, created_at);

-- Issues and pull requests share GitHub's issue numbering.
CREATE TABLE IF NOT EXISTS issues (
  repo       text NOT NULL DEFAULT 'maximhq/bifrost',
  number     integer NOT NULL,
  is_pr      boolean NOT NULL,
  title      text,
  author     text,
  state      text NOT NULL,
  created_at timestamptz NOT NULL,
  closed_at  timestamptz,
  merged_at  timestamptz,
  labels     text[] NOT NULL DEFAULT '{}',
  comments   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (repo, number)
);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS repo text NOT NULL DEFAULT 'maximhq/bifrost';
CREATE INDEX IF NOT EXISTS issues_created_idx ON issues (is_pr, created_at);
CREATE INDEX IF NOT EXISTS issues_closed_idx  ON issues (is_pr, closed_at);
CREATE INDEX IF NOT EXISTS issues_updated_idx ON issues (updated_at);
CREATE INDEX IF NOT EXISTS issues_repo_created_idx ON issues (repo, is_pr, created_at);
CREATE INDEX IF NOT EXISTS issues_repo_closed_idx  ON issues (repo, is_pr, closed_at);
CREATE INDEX IF NOT EXISTS issues_repo_updated_idx ON issues (repo, updated_at);

CREATE TABLE IF NOT EXISTS commits (
  repo         text NOT NULL DEFAULT 'maximhq/bifrost',
  sha          text NOT NULL,
  author_login text,
  author_name  text,
  committed_at timestamptz NOT NULL,
  message      text,
  PRIMARY KEY (repo, sha)
);
ALTER TABLE commits ADD COLUMN IF NOT EXISTS repo text NOT NULL DEFAULT 'maximhq/bifrost';
CREATE INDEX IF NOT EXISTS commits_committed_idx ON commits (committed_at);
CREATE INDEX IF NOT EXISTS commits_author_idx    ON commits (author_login, committed_at);
CREATE INDEX IF NOT EXISTS commits_repo_committed_idx ON commits (repo, committed_at);
CREATE INDEX IF NOT EXISTS commits_repo_author_idx    ON commits (repo, author_login, committed_at);

CREATE TABLE IF NOT EXISTS releases (
  repo         text NOT NULL DEFAULT 'maximhq/bifrost',
  release_id   bigint PRIMARY KEY,                          -- GitHub ids are global
  tag          text NOT NULL,
  name         text,
  prerelease   boolean NOT NULL DEFAULT false,
  draft        boolean NOT NULL DEFAULT false,
  published_at timestamptz
);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS repo text NOT NULL DEFAULT 'maximhq/bifrost';
CREATE INDEX IF NOT EXISTS releases_published_idx ON releases (published_at);
CREATE INDEX IF NOT EXISTS releases_repo_published_idx ON releases (repo, published_at);

-- Databases from before the repo column: widen the keys that GitHub only makes
-- unique within one repository.
DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'stargazers_pkey') = 'PRIMARY KEY (login)' THEN
    ALTER TABLE stargazers DROP CONSTRAINT stargazers_pkey, ADD PRIMARY KEY (repo, login);
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'issues_pkey') = 'PRIMARY KEY (number)' THEN
    ALTER TABLE issues DROP CONSTRAINT issues_pkey, ADD PRIMARY KEY (repo, number);
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'commits_pkey') = 'PRIMARY KEY (sha)' THEN
    ALTER TABLE commits DROP CONSTRAINT commits_pkey, ADD PRIMARY KEY (repo, sha);
  END IF;
END $$;

-- Audit log of collector executions.
CREATE TABLE IF NOT EXISTS collector_runs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,                               -- snapshot | sync | backfill
  triggered_by text NOT NULL DEFAULT 'cron',                -- cron | manual
  status       text NOT NULL DEFAULT 'running',             -- running | ok | partial | error
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  api_calls    integer NOT NULL DEFAULT 0,
  detail       jsonb,
  error        text
);
CREATE INDEX IF NOT EXISTS collector_runs_started_idx ON collector_runs (started_at DESC);

-- Cursors for incremental syncs.
CREATE TABLE IF NOT EXISTS sync_state (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Compare page: other repositories tracked alongside the primary one
-- ---------------------------------------------------------------------------

-- A repository added on the Compare page. Removing it only sets removed_at, so
-- its readings survive and re-adding it brings the history straight back.
CREATE TABLE IF NOT EXISTS tracked_repos (
  id              serial PRIMARY KEY,
  full_name       text NOT NULL,                             -- owner/name as GitHub spells it
  github_id       bigint,
  description     text,
  homepage        text,
  language        text,
  repo_created_at timestamptz,
  trendshift_id   integer,
  added_at        timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tracked_repos_name_idx ON tracked_repos (lower(full_name));

-- Headline counts of a tracked repo, one row per collector run, in the same
-- 6-hour slots as `snapshots`. Their events go into the shared event tables
-- above once the collector has backfilled them; until then their daily
-- activity is the change between consecutive day-close readings.
CREATE TABLE IF NOT EXISTS repo_snapshots (
  id            bigserial PRIMARY KEY,
  repo_id       integer     NOT NULL REFERENCES tracked_repos (id) ON DELETE CASCADE,
  captured_at   timestamptz NOT NULL,
  ist_date      date        NOT NULL,
  slot          smallint    NOT NULL CHECK (slot IN (0,6,12,18)),
  triggered_by  text        NOT NULL DEFAULT 'cron',
  stars         integer NOT NULL,
  forks         integer NOT NULL,
  watchers      integer NOT NULL,
  open_issues   integer NOT NULL,
  closed_issues integer NOT NULL,
  open_prs      integer NOT NULL,
  merged_prs    integer NOT NULL,
  closed_prs    integer NOT NULL,                             -- closed without merge
  contributors  integer,
  commits       integer,                                      -- on default branch
  releases      integer,
  discussions   integer,
  size_kb       integer
);
CREATE INDEX IF NOT EXISTS repo_snapshots_repo_idx ON repo_snapshots (repo_id, ist_date, slot, captured_at);

-- Activity per period from an outside source (Trendshift), for history before a
-- repo's first snapshot. Periods are UTC days or months. A null metric means the
-- source did not report it. Our own readings always take precedence.
CREATE TABLE IF NOT EXISTS external_gains (
  repo          text NOT NULL,                                -- owner/name
  source        text NOT NULL,                                -- e.g. 'trendshift'
  granularity   text NOT NULL CHECK (granularity IN ('day','month')),
  period_start  date NOT NULL,                                -- UTC; first day of the month for 'month'
  stars         integer CHECK (stars >= 0),
  forks         integer CHECK (forks >= 0),
  issues_opened integer CHECK (issues_opened >= 0),
  issues_closed integer CHECK (issues_closed >= 0),
  prs_merged    integer CHECK (prs_merged >= 0),
  captured_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo, source, granularity, period_start)
);
