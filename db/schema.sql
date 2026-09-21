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
CREATE TABLE IF NOT EXISTS stargazers (
  login        text PRIMARY KEY,
  starred_at   timestamptz NOT NULL,
  unstarred_at timestamptz                                  -- set when a full sync no longer sees the login
);
ALTER TABLE stargazers ADD COLUMN IF NOT EXISTS unstarred_at timestamptz;
CREATE INDEX IF NOT EXISTS stargazers_starred_idx ON stargazers (starred_at);

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
  fork_id    bigint PRIMARY KEY,
  owner      text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS forks_created_idx ON forks (created_at);

-- Issues and pull requests share GitHub's issue numbering.
CREATE TABLE IF NOT EXISTS issues (
  number     integer PRIMARY KEY,
  is_pr      boolean NOT NULL,
  title      text,
  author     text,
  state      text NOT NULL,
  created_at timestamptz NOT NULL,
  closed_at  timestamptz,
  merged_at  timestamptz,
  labels     text[] NOT NULL DEFAULT '{}',
  comments   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS issues_created_idx ON issues (is_pr, created_at);
CREATE INDEX IF NOT EXISTS issues_closed_idx  ON issues (is_pr, closed_at);
CREATE INDEX IF NOT EXISTS issues_updated_idx ON issues (updated_at);

CREATE TABLE IF NOT EXISTS commits (
  sha          text PRIMARY KEY,
  author_login text,
  author_name  text,
  committed_at timestamptz NOT NULL,
  message      text
);
CREATE INDEX IF NOT EXISTS commits_committed_idx ON commits (committed_at);
CREATE INDEX IF NOT EXISTS commits_author_idx    ON commits (author_login, committed_at);

CREATE TABLE IF NOT EXISTS releases (
  release_id   bigint PRIMARY KEY,
  tag          text NOT NULL,
  name         text,
  prerelease   boolean NOT NULL DEFAULT false,
  draft        boolean NOT NULL DEFAULT false,
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS releases_published_idx ON releases (published_at);

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
