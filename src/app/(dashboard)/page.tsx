import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { formatInt, signed } from "@/lib/format";
import { dailySeries, firstSnapshot, latestSnapshot, type DailyPoint } from "@/lib/queries";
import { rollingMean, sumBy } from "@/lib/stats";
import { addDays, formatDate, formatIstDateTime, istDate } from "@/lib/time";

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
  const from = addDays(today, -30);
  const [latest, series, first] = await Promise.all([latestSnapshot(), dailySeries(from, today), firstSnapshot()]);

  const n = series.length;
  const cur = series[n - 1];
  const yday = series[n - 2];
  const week = series[n - 8];
  const month = series[0];
  const hasData = latest !== null || series.some((p) => p.stars > 0 || p.commits_total > 0);

  const stars = latest?.stars ?? cur.stars;
  const gain7 = stars - week.stars;
  const gain30 = stars - month.stars;
  const perDay7 = gain7 / 7;
  const milestone = Math.ceil((stars + 1) / 1000) * 1000;
  const etaDays = perDay7 > 0 ? Math.ceil((milestone - stars) / perDay7) : null;

  const avg7 = rollingMean(
    series.map((p) => p.new_stars),
    7,
  );
  const newStarsData = series.map((p, i) => ({ date: p.date, new_stars: p.new_stars, avg7: avg7[i] === null ? null : Math.round(avg7[i] * 10) / 10 }));
  const totalsData = series.map((p) => ({ date: p.date, stars: p.stars }));

  const thisWeek = series.slice(-7);
  const lastWeek = series.slice(-14, -7);
  const weekRows = WEEK_ROWS.map((r) => {
    const a = sumBy(thisWeek, (p) => Number(p[r.key]));
    const b = sumBy(lastWeek, (p) => Number(p[r.key]));
    return { key: r.key, label: r.label, thisWeek: a, lastWeek: b, change: a - b };
  });

  return (
    <div className="space-y-4">
      {!hasData && (
        <Card title="No data yet">
          <p className="text-sm text-ink-2">
            Run <code className="rounded bg-grid px-1">npm run backfill</code> to load history and{" "}
            <code className="rounded bg-grid px-1">npm run collect</code> (or the Refresh button) to take the first snapshot. Progress shows on the
            Status page.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:grid-cols-[1.6fr_repeat(6,1fr)]">
        <StatTile
          label="Stars"
          value={stars}
          hero
          delta={yday ? stars - yday.stars : null}
          deltaLabel="today so far"
          upIsGood
          trend={series.slice(-14).map((p) => p.stars)}
          hint={`${signed(gain7)} in 7 d · ${signed(gain30)} in 30 d`}
        />
        <StatTile label="Forks" value={latest?.forks ?? cur.forks} delta={yday ? (latest?.forks ?? cur.forks) - yday.forks : null} deltaLabel="today" upIsGood />
        <StatTile label="Watchers" value={latest?.watchers ?? cur.watchers} delta={yday?.watchers != null && latest ? latest.watchers - yday.watchers : null} deltaLabel="today" upIsGood />
        <StatTile label="Open issues" value={latest?.open_issues ?? cur.open_issues} delta={yday ? (latest?.open_issues ?? cur.open_issues) - yday.open_issues : null} deltaLabel="today" />
        <StatTile label="Open PRs" value={latest?.open_prs ?? cur.open_prs} delta={yday ? (latest?.open_prs ?? cur.open_prs) - yday.open_prs : null} deltaLabel="today" />
        <StatTile label="Contributors" value={latest?.contributors ?? cur.contributors} delta={week ? (latest?.contributors ?? cur.contributors) - week.contributors : null} deltaLabel="in 7 d" upIsGood />
        <StatTile label="Discussions" value={latest?.discussions ?? null} hint={latest?.discussions == null ? "Needs GITHUB_TOKEN" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Stars, last 30 days" subtitle={first ? `Snapshots since ${formatDate(first.ist_date)}; earlier days reconstructed from star timestamps` : "Reconstructed from star timestamps"}>
          <TimeSeriesChart data={totalsData} series={[{ key: "stars", label: "Stars", color: "var(--series-1)", type: "area" }]} zeroBased={false} />
        </Card>
        <Card title="New stars per day" subtitle="Gross new stars by IST calendar day, with a trailing 7-day average">
          <TimeSeriesChart
            data={newStarsData}
            series={[
              { key: "new_stars", label: "New stars", color: "var(--series-1)", type: "bar" },
              { key: "avg7", label: "7-day average", color: "var(--series-gray)", type: "line" },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Pace" subtitle="Based on the last 7 days">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-2">Stars per day</dt>
              <dd className="text-xl font-semibold text-ink">{perDay7.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-2">Next milestone</dt>
              <dd className="text-xl font-semibold text-ink">{formatInt(milestone)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-2">Stars to go</dt>
              <dd className="text-xl font-semibold text-ink">{formatInt(milestone - stars)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-2">ETA at this pace</dt>
              <dd className="text-xl font-semibold text-ink">{etaDays === null ? "—" : `${etaDays} d`}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Latest snapshot: {latest ? formatIstDateTime(latest.captured_at) : "none yet"}. Daily values use the last reading before midnight IST.
          </p>
        </Card>
        <Card title="This week vs last week" subtitle="Rolling 7-day windows ending today (IST)">
          <DataTable
            rows={weekRows}
            rowKey={(r) => r.key}
            dense
            columns={[
              { key: "label", label: "Metric", render: (r) => r.label },
              { key: "thisWeek", label: "This week", align: "right", render: (r) => formatInt(r.thisWeek) },
              { key: "lastWeek", label: "Last week", align: "right", render: (r) => formatInt(r.lastWeek) },
              {
                key: "change",
                label: "Change",
                align: "right",
                render: (r) => <span className={r.change > 0 ? "text-good" : r.change < 0 ? "text-bad" : "text-ink-2"}>{signed(r.change)}</span>,
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
