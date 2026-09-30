import { CircleDot, Eye, GitFork, GitPullRequest, MessagesSquare, Rocket, Star, Users } from "lucide-react";
import { Suspense } from "react";
import { ActivityTrends } from "@/components/ActivityTrends";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { BusiestWindowCard, BusiestWindowCardSkeleton } from "@/components/overview/BusiestWindowCard";
import { RivalsCard, RivalsCardSkeleton } from "@/components/overview/RivalsCard";
import { PageHeader } from "@/components/PageHeader";
import { Sparkline } from "@/components/Sparkline";
import { StatTile } from "@/components/StatTile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { env } from "@/lib/env";
import { fixed, formatInt, signed, signedPct } from "@/lib/format";
import { dailySeries, dataStartDate, externalMonthlyStars, firstSnapshot, hasStarEvents, latestSnapshot, type DailyPoint } from "@/lib/queries";
import { sumBy } from "@/lib/stats";
import { addDays, formatDate, formatShortDate, istDate } from "@/lib/time";
import { dailyTrend } from "@/lib/trends";

export const dynamic = "force-dynamic";

const WEEK_ROWS: { key: keyof DailyPoint; label: string }[] = [
  { key: "new_stars", label: "New stars" },
  { key: "new_forks", label: "New forks" },
  { key: "issues_opened", label: "Issues opened" },
  { key: "issues_closed", label: "Issues closed" },
  { key: "prs_opened", label: "PRs opened" },
  { key: "prs_merged", label: "PRs merged" },
  { key: "commits", label: "Commits" },
  { key: "new_contributors", label: "New contributors" },
  { key: "releases_published", label: "Releases" },
];

export default async function OverviewPage() {
  const today = istDate();
  // The whole history feeds the activity trends; the rest of the page reads the last 30 days of it.
  const monthAgo = addDays(today, -30);
  const dataStart = await dataStartDate();
  const [latest, history, first, starEvents, monthlyStars] = await Promise.all([
    latestSnapshot(),
    dailySeries(dataStart < monthAgo ? dataStart : monthAgo, today),
    firstSnapshot(),
    hasStarEvents(),
    externalMonthlyStars(),
  ]);
  const series = history.slice(-31);

  const n = series.length;
  const cur = series[n - 1];
  const yday = series[n - 2];
  const week = series[n - 8];
  const month = series[0];
  const hasData = latest !== null || series.some((p) => p.stars > 0 || p.commits_total > 0);

  const stars = latest?.stars ?? cur.stars;
  // Without star events, a day's star total is only known from a snapshot or an outside estimate.
  const trusted = (p: DailyPoint) => p.stars_known;
  const estimated = history.some((p) => p.stars_estimated) || Object.keys(monthlyStars).length > 0;
  const trendshift = (
    <a href="https://trendshift.io/repositories/14529" target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
      Trendshift
    </a>
  );
  const gain7 = trusted(week) ? stars - week.stars : null;
  const gain30 = trusted(month) ? stars - month.stars : null;
  const perDay7 = gain7 === null ? null : gain7 / 7;
  const milestone = Math.ceil((stars + 1) / 1000) * 1000;
  const etaDays = perDay7 !== null && perDay7 > 0 ? Math.ceil((milestone - stars) / perDay7) : null;

  const trend = dailyTrend(history);
  const monthly = Object.fromEntries(Object.entries(monthlyStars).map(([month, stars]) => [month, { stars }]));
  const starsNote =
    starEvents || !first ? undefined : estimated ? (
      <>
        Star gains up to {formatDate(first.ist_date)} are estimates from {trendshift} (UTC days; months only before its daily record starts); after that they are the net change between our daily
        snapshots, since GitHub does not expose the stargazer list to this token.
      </>
    ) : (
      `Star gains are the net change between daily snapshots, so they begin after the first snapshot on ${formatDate(first.ist_date)}.`
    );

  const thisWeek = series.slice(-7);
  const lastWeek = series.slice(-14, -7);
  const weekRows = WEEK_ROWS.map((r) => {
    const a = sumBy(thisWeek, (p) => Number(p[r.key]));
    const b = sumBy(lastWeek, (p) => Number(p[r.key]));
    return { key: r.key, label: r.label, thisWeek: a, lastWeek: b, change: a - b, changePct: b ? (a - b) / b : null, trend: series.slice(-14).map((p) => Number(p[r.key])) };
  });
  const watchers = latest?.watchers ?? cur.watchers;
  const discussions = latest?.discussions ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description={`Headline numbers for ${env.repo}, captured four times a day (IST).`} />

      {!hasData && (
        <Alert>
          <Rocket />
          <AlertTitle>No data yet</AlertTitle>
          <AlertDescription>
            <p>
              Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run backfill</code> to load history and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run collect</code> (or the Refresh button) to take the first snapshot.
              Progress shows on the Status page.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <StatTile
          label="Stars"
          icon={<Star />}
          value={stars}
          hero
          delta={yday && trusted(yday) ? stars - yday.stars : null}
          deltaLabel="today so far"
          upIsGood
          trend={series.slice(-14).filter(trusted).map((p) => p.stars)}
          hint={
            <>
              {signed(gain7)} in 7 d · {signed(gain30)} in 30 d
              {etaDays !== null && (
                <span className="block">
                  {fixed(perDay7)} a day, so {formatInt(milestone)} by ~{formatShortDate(addDays(today, etaDays))}
                </span>
              )}
            </>
          }
        />
        <div className="flex flex-col gap-3">
          <div className="grid flex-1 grid-cols-2 gap-4">
            <StatTile label="Forks" icon={<GitFork />} value={latest?.forks ?? cur.forks} delta={yday ? (latest?.forks ?? cur.forks) - yday.forks : null} deltaLabel="today" upIsGood />
            <StatTile label="Open issues" icon={<CircleDot />} value={latest?.open_issues ?? cur.open_issues} delta={yday ? (latest?.open_issues ?? cur.open_issues) - yday.open_issues : null} deltaLabel="today" />
            <StatTile label="Open PRs" icon={<GitPullRequest />} value={latest?.open_prs ?? cur.open_prs} delta={yday ? (latest?.open_prs ?? cur.open_prs) - yday.open_prs : null} deltaLabel="today" />
            <StatTile label="Contributors" icon={<Users />} value={latest?.contributors ?? cur.contributors} delta={week ? (latest?.contributors ?? cur.contributors) - week.contributors : null} deltaLabel="in 7 d" upIsGood />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground tnum">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" aria-hidden /> {formatInt(watchers)} watchers
            </span>
            {discussions !== null && (
              <span className="inline-flex items-center gap-1.5">
                <MessagesSquare className="size-3.5" aria-hidden /> {formatInt(discussions)} discussions
              </span>
            )}
          </p>
        </div>
      </div>

      <section aria-label="Repository activity" className="space-y-2">
        <div className="grid gap-4 xl:grid-cols-2">
          <ActivityTrends group="day" days={trend} monthly={monthly} defaultPreset="60d" presets={["7d", "30d", "60d", "90d", "6m", "custom"]} />
          <ActivityTrends group="month" days={trend} monthly={monthly} defaultPreset="2y" presets={["6m", "1y", "2y", "all", "custom"]} />
        </div>
        {starsNote && <p className="px-1 text-xs text-pretty text-muted-foreground">{starsNote}</p>}
      </section>

      {/* These two read more data; they stream in so the rest of the page is not held up. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<RivalsCardSkeleton />}>
          <RivalsCard today={today} />
        </Suspense>
        <Suspense fallback={<BusiestWindowCardSkeleton />}>
          <BusiestWindowCard today={today} />
        </Suspense>
      </div>

      <Card title="This week vs last week" subtitle="Rolling 7-day windows ending today (IST); the trend line covers both weeks.">
        <DataTable
          rows={weekRows}
          rowKey={(r) => r.key}
          dense
          columns={[
            { key: "label", label: "Metric", className: "whitespace-nowrap", render: (r) => <span className="font-medium">{r.label}</span> },
            { key: "trend", label: "Last 14 days", render: (r) => <Sparkline values={r.trend} className="h-6 w-28" /> },
            { key: "thisWeek", label: "This week", align: "right", render: (r) => formatInt(r.thisWeek) },
            { key: "lastWeek", label: "Last week", align: "right", render: (r) => <span className="text-muted-foreground">{formatInt(r.lastWeek)}</span> },
            {
              key: "change",
              label: "Change",
              align: "right",
              render: (r) => <span className={r.change > 0 ? "font-medium text-good" : r.change < 0 ? "font-medium text-bad" : "text-muted-foreground"}>{signed(r.change)}</span>,
            },
            {
              key: "changePct",
              label: "%",
              align: "right",
              render: (r) => <span className={r.change > 0 ? "text-good" : r.change < 0 ? "text-bad" : "text-muted-foreground"}>{signedPct(r.changePct)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
