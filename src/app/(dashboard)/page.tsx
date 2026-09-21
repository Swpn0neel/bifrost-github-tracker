import { CircleDot, Eye, GitFork, GitPullRequest, MessagesSquare, Rocket, Star, Users } from "lucide-react";
import { ActivityTrends } from "@/components/ActivityTrends";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { env } from "@/lib/env";
import { formatInt, signed } from "@/lib/format";
import { dailySeries, dataStartDate, externalMonthlyStars, firstSnapshot, hasStarEvents, latestSnapshot, type DailyPoint } from "@/lib/queries";
import { rollingMean, sumBy } from "@/lib/stats";
import { addDays, formatDate, formatIstDateTime, istDate } from "@/lib/time";
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

  const avg7 = rollingMean(
    series.map((p) => (p.new_stars_known ? p.new_stars : null)),
    7,
  );
  const newStarsData = series.map((p, i) => ({ date: p.date, new_stars: p.new_stars_known ? p.new_stars : null, avg7: avg7[i] === null ? null : Math.round(avg7[i] * 10) / 10 }));
  const totalsData = series.map((p) => ({ date: p.date, stars: trusted(p) ? p.stars : null }));

  const thisWeek = series.slice(-7);
  const lastWeek = series.slice(-14, -7);
  const weekRows = WEEK_ROWS.map((r) => {
    const a = sumBy(thisWeek, (p) => Number(p[r.key]));
    const b = sumBy(lastWeek, (p) => Number(p[r.key]));
    return { key: r.key, label: r.label, thisWeek: a, lastWeek: b, change: a - b };
  });

  const milestoneProgress = Math.min(1, Math.max(0, (stars - (milestone - 1000)) / 1000));

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
          hint={`${signed(gain7)} in 7 d · ${signed(gain30)} in 30 d`}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="Forks" icon={<GitFork />} value={latest?.forks ?? cur.forks} delta={yday ? (latest?.forks ?? cur.forks) - yday.forks : null} deltaLabel="today" upIsGood />
          <StatTile label="Watchers" icon={<Eye />} value={latest?.watchers ?? cur.watchers} delta={yday?.watchers != null && latest ? latest.watchers - yday.watchers : null} deltaLabel="today" upIsGood />
          <StatTile label="Open issues" icon={<CircleDot />} value={latest?.open_issues ?? cur.open_issues} delta={yday ? (latest?.open_issues ?? cur.open_issues) - yday.open_issues : null} deltaLabel="today" />
          <StatTile label="Open PRs" icon={<GitPullRequest />} value={latest?.open_prs ?? cur.open_prs} delta={yday ? (latest?.open_prs ?? cur.open_prs) - yday.open_prs : null} deltaLabel="today" />
          <StatTile label="Contributors" icon={<Users />} value={latest?.contributors ?? cur.contributors} delta={week ? (latest?.contributors ?? cur.contributors) - week.contributors : null} deltaLabel="in 7 d" upIsGood />
          <StatTile label="Discussions" icon={<MessagesSquare />} value={latest?.discussions ?? null} hint={latest?.discussions == null ? "Needs GITHUB_TOKEN" : undefined} />
        </div>
      </div>

      <ActivityTrends
        days={dailyTrend(history)}
        monthlyStars={monthlyStars}
        starsNote={
          starEvents || !first ? undefined : estimated ? (
            <>Star gains up to {formatDate(first.ist_date)} are estimates from {trendshift} (UTC days; months only before its daily record starts); after that they are the net change between our daily snapshots.</>
          ) : (
            `Star gains are the net change between daily snapshots, so they begin after the first snapshot on ${formatDate(first.ist_date)}.`
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="Stars, last 30 days"
          subtitle={
            !first ? "No snapshots yet" : starEvents ? `Snapshots since ${formatDate(first.ist_date)}; earlier days reconstructed from star timestamps` : estimated ? (
              <>Snapshots since {formatDate(first.ist_date)}; earlier days counted back from the first snapshot using {trendshift}&apos;s daily star gains (estimate)</>
            ) : (
              `Snapshots since ${formatDate(first.ist_date)}; no star history before that (GitHub does not expose the stargazer list to this token)`
            )
          }
        >
          <TimeSeriesChart data={totalsData} series={[{ key: "stars", label: "Stars", color: "var(--series-1)", type: "area" }]} zeroBased={false} />
        </Card>
        <Card
          title="New stars per day"
          subtitle={
            starEvents ? "Gross new stars by IST calendar day, with a trailing 7-day average" : (
              <>
                Net change between daily snapshots, with a trailing 7-day average. GitHub does not expose the stargazer list to this token
                {estimated && first ? <>; days up to {formatDate(first.ist_date)} are estimates from {trendshift} (UTC days)</> : null}.
              </>
            )
          }
        >
          <TimeSeriesChart
            data={newStarsData}
            series={[
              { key: "new_stars", label: starEvents ? "New stars" : "Net new stars", color: "var(--series-1)", type: "bar" },
              { key: "avg7", label: "7-day average", color: "var(--series-gray)", type: "line" },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card title="Pace" subtitle="Based on the last 7 days">
          <dl className="grid grid-cols-2 gap-3">
            {[
              { term: "Stars per day", value: perDay7 === null ? "—" : perDay7.toFixed(1) },
              { term: "Next milestone", value: formatInt(milestone) },
              { term: "Stars to go", value: formatInt(milestone - stars) },
              { term: "ETA at this pace", value: etaDays === null ? "—" : `${etaDays} d` },
            ].map((item) => (
              <div key={item.term} className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{item.term}</dt>
                <dd className="mt-0.5 font-heading text-xl font-semibold tracking-tight text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground tnum">
              <span>{formatInt(milestone - 1000)}</span>
              <span className="font-medium text-foreground">{Math.round(milestoneProgress * 100)}% of the way</span>
              <span>{formatInt(milestone)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${formatInt(stars)} of ${formatInt(milestone)} stars`}>
              <div className="h-full rounded-full bg-(--series-1)" style={{ width: `${milestoneProgress * 100}%` }} />
            </div>
          </div>
          <p className="mt-4 text-xs text-pretty text-muted-foreground">
            Latest snapshot: {latest ? formatIstDateTime(latest.captured_at) : "none yet"}. Daily values use the scheduled midnight IST reading; Refresh only updates the live numbers.
          </p>
        </Card>
        <Card title="This week vs last week" subtitle="Rolling 7-day windows ending today (IST)">
          <DataTable
            rows={weekRows}
            rowKey={(r) => r.key}
            dense
            columns={[
              { key: "label", label: "Metric", render: (r) => <span className="font-medium">{r.label}</span> },
              { key: "thisWeek", label: "This week", align: "right", render: (r) => formatInt(r.thisWeek) },
              { key: "lastWeek", label: "Last week", align: "right", render: (r) => <span className="text-muted-foreground">{formatInt(r.lastWeek)}</span> },
              {
                key: "change",
                label: "Change",
                align: "right",
                render: (r) => <span className={r.change > 0 ? "font-medium text-good" : r.change < 0 ? "font-medium text-bad" : "text-muted-foreground"}>{signed(r.change)}</span>,
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
