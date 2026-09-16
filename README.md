# Bifrost GitHub tracker

Internal dashboard that snapshots `maximhq/bifrost` on GitHub four times a day (12 AM, 6 AM, 12 PM, 6 PM IST), stores everything in Neon Postgres, and shows the numbers by day and by 6-hour window.

- **Overview** – stars hero, today's deltas, 30-day trend, pace to the next milestone, this week vs last week.
- **Daily** – one value per IST day for stars, forks, issues, PRs, commits, contributors; any date range; table view.
- **Quarters** – the four daily windows: stacked per day, weekday × window heatmap, net change between snapshots.
- **Issues & PRs** – opened vs closed, backlog, median time to close/merge, merge rate, age buckets, labels, oldest and most-discussed.
- **Activity** – commits, new contributors, releases, top contributors.
- **Status** – collector runs, next scheduled run, table counts, sync cursors.

## How the numbers are defined

- **Snapshot**: the collector's reading of the headline counts (stars, forks, watchers, open/closed issues, open/merged/closed PRs, contributors, commits on the default branch, releases, discussions). One row per run.
- **Daily value**: the last snapshot before midnight IST (technically the latest one in `D 00:30 → D+1 00:30` IST, so the midnight cron run closes the previous day).
- **Quarter / window**: `12 AM–6 AM`, `6 AM–12 PM`, `12 PM–6 PM`, `6 PM–12 AM` IST. Gross activity in a window counts events (stars, forks, issues, PRs, commits) whose GitHub timestamp falls inside it. Net change is the difference between the snapshots at the start and end of the window.
- **Reconstructed history**: before the first snapshot, totals are rebuilt from event timestamps (`starred_at`, `created_at`, `closed_at`, `merged_at`, …) and anchored to the first real snapshot. Stars that were later removed are only known from the day the tracker started, so reconstructed star totals are close but not exact.
- `open_issues_count` from GitHub includes PRs; this dashboard always separates them.

## Local setup

Requires Node 20+ (installed via nvm) and a Neon database.

```bash
cp .env.example .env.local   # fill in DATABASE_URL, GITHUB_TOKEN, DASHBOARD_PASSWORD, SESSION_SECRET, COLLECT_SECRET
npm install
npm run db:migrate           # applies db/schema.sql (idempotent)
npm run backfill             # one-time history load; needs GITHUB_TOKEN (~5 min, a few hundred API calls)
npm run collect              # take one snapshot + incremental sync
npm run dev                  # http://localhost:3000
```

The GitHub token only needs public read access. Without it the collector still snapshots the headline numbers, but the backfill and event sync are skipped (stargazer timestamps require authentication and the anonymous limit is 60 requests/hour).

## Railway deployment

Two services from the same repo share one Neon database:

| Service | Config file | What it does |
|---|---|---|
| `web` | `railway.json` (default) | `next start`; health check on `/api/health` |
| `collector` | `railway.collector.json` | cron `30 0,6,12,18 * * *` UTC = 6 AM, 12 PM, 6 PM, 12 AM IST; runs `npm run collect` and exits |

1. Create a Railway project and add a service from this GitHub repo. That is the `web` service.
2. Add a second service from the same repo. In its settings set **Config-as-code → Config file path** to `railway.collector.json` (or set the cron schedule and start command by hand).
3. Set the same variables on both services: `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `COLLECT_SECRET`. Railway's shared variables or a variable reference (`${{web.DATABASE_URL}}`) keeps them in one place.
4. Generate a public domain for `web`. Open it, sign in with `DASHBOARD_PASSWORD`, and press **Refresh now** to take the first snapshot.
5. Run the backfill once from your machine (`npm run backfill`) or from a one-off Railway shell.

`POST /api/collect` with `Authorization: Bearer $COLLECT_SECRET` triggers a snapshot from anywhere (a second cron, a webhook, a script).

## Layout

```
db/schema.sql            tables + indexes (also applied by npm run db:migrate)
src/collector/           snapshot.ts (headline counts), sync.ts (event tables), jobs.ts (run bookkeeping), run.ts (CLI)
src/lib/github.ts        REST/GraphQL client with pagination, rate-limit backoff
src/lib/queries.ts       all dashboard SQL, IST bucketing, snapshot/reconstruction merge
src/lib/time.ts          IST helpers and the four windows
src/app/(dashboard)/     pages; src/app/api/ login, logout, collect, health
src/components/          charts (Recharts), tiles, tables, filters
src/proxy.ts             password gate (signed cookie)
```
