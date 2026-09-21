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
- **Scheduled snapshot**: one taken by the cron collector (`npm run collect`) within the first hour of its window. Only these define days and windows. The dashboard's **Refresh now** button (and `POST /api/refresh`, or an off-schedule Railway "Run now") also stores a snapshot and syncs events, which updates the live numbers, but it never overrides a scheduled reading, so clicking it cannot skew the 12 AM / 6 AM / 12 PM / 6 PM series. Refresh is refused while another run is still in progress.
- **Daily value**: the last scheduled snapshot of the day, i.e. the next day's 12 AM run, or the latest earlier scheduled run that day if the midnight one is missing. Only a day with no scheduled snapshot at all falls back to the last snapshot taken on it.
- **Quarter / window**: `12 AM–6 AM`, `6 AM–12 PM`, `12 PM–6 PM`, `6 PM–12 AM` IST. Gross activity in a window counts events (stars, forks, issues, PRs, commits) whose GitHub timestamp falls inside it. Net change is the difference between the scheduled snapshots at the start and end of the window; a window whose scheduled run is missing shows no net change.
- **Reconstructed history**: before the first snapshot, totals are rebuilt from event timestamps (`created_at`, `closed_at`, `merged_at`, …) and anchored to the first real snapshot.
- **Stars are the exception.** GitHub only exposes a repository's stargazer list (with `starred_at`) to tokens that have collaborator access to that repository; every other token gets 404/403 on REST and an empty list on GraphQL. With a read-only account the collector detects this once (`sync_state.stargazers_unavailable`), skips the star sync, and the dashboard derives daily and per-window star gains from the net change between consecutive snapshots, labelled as such. Days before the first snapshot show no star total. If the token ever gains collaborator access, the existing code loads the full star list on its next run.
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

The GitHub token only needs public read access (a fine-grained token with "Public repositories (read-only)" is ideal). Without it the collector still snapshots the headline numbers, but the backfill and event sync are skipped (the anonymous limit is 60 requests/hour). If GitHub rejects the token, the collector logs it and continues anonymously rather than failing.

**Star history before the first snapshot.** GitHub does not expose the stargazer list to a read-only token, so the tracker only measures star gains from its own snapshots. Earlier history can be filled in once from an outside source: `npm run import:stars -- capture.json` loads per-day and per-month star gains (UTC periods) into `external_star_gains`. Snapshots always take precedence, imported values are labelled as estimates in the UI, and the dashboard works the same without them.

## Railway deployment

Live at https://bifrost-gh-tracker.up.railway.app (project `bifrost-github-tracker`). Two services from the same repo share one Neon database:

| Service | Settings | What it does |
|---|---|---|
| `web` | default build, `railway.json` health check on `/api/health`, public domain with target port 8080 | `next start`; Railway injects `PORT` (8080), which Next honours |
| `collector` | Custom start command `npm run collect`, cron schedule `30 0,6,12,18 * * *` (UTC = 6 AM, 12 PM, 6 PM, 12 AM IST) | one snapshot + incremental sync per run, then exits |

Railway's config-as-code files are deprecated, so the collector's start command and cron schedule live in the service settings UI rather than a JSON file.

Variables: `web` holds `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `COLLECT_SECRET`. `collector` references them (`DATABASE_URL=${{web.DATABASE_URL}}` etc.) so secrets are entered once.

To reproduce from scratch:

1. New project → GitHub repository → this repo (the Railway GitHub App must have access to it). Rename the service `web`, paste the variables into its Raw Editor, generate a domain.
2. Add a second service from the same repo, name it `collector`, set the start command and cron schedule above, and add the three `${{web.*}}` references.
3. Deploy. Open the domain, sign in with `DASHBOARD_PASSWORD`, press **Refresh now** for the first snapshot.
4. Run the history backfill once (`npm run backfill` locally with `GITHUB_TOKEN` set, or from the collector's Railway shell).

`POST /api/refresh` with `Authorization: Bearer $COLLECT_SECRET` triggers a snapshot from anywhere. (It is not called `/api/collect` because EasyPrivacy, on by default in uBlock Origin, Brave and AdGuard, blocks fetches to any URL ending in `/api/collect`, which made the button fail with "Failed to fetch".)

## Layout

```
db/schema.sql            tables + indexes (also applied by npm run db:migrate)
src/collector/           snapshot.ts (headline counts), sync.ts (event tables), jobs.ts (run bookkeeping), run.ts (CLI)
src/lib/github.ts        REST/GraphQL client with pagination, rate-limit backoff
src/lib/queries.ts       all dashboard SQL, IST bucketing, snapshot/reconstruction merge
src/lib/time.ts          IST helpers and the four windows
src/app/(dashboard)/     pages; src/app/api/ login, logout, collect, health
src/components/          charts (Recharts), tiles, tables, filters; layout/ is the sidebar shell
src/components/ui/       shadcn/ui primitives (add more with npx shadcn@latest add <name>)
src/proxy.ts             password gate (signed cookie)
```
