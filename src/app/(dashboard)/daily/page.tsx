import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { RangeFilter } from "@/components/RangeFilter";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { formatInt } from "@/lib/format";
import { dailySeries, dataStartDate, firstSnapshot } from "@/lib/queries";
import { resolveRange, type SearchParams } from "@/lib/range";
import { rollingMean, sumBy } from "@/lib/stats";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DailyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const dataStart = await dataStartDate();
  const range = resolveRange(sp, dataStart, "30d");
  const [series, first] = await Promise.all([dailySeries(range.from, range.to), firstSnapshot()]);

  const avg7 = rollingMean(
    series.map((p) => p.new_stars),
    7,
  );
  const rows = series.map((p, i) => ({ ...p, avg7: avg7[i] === null ? null : Math.round(avg7[i] * 10) / 10 }));
  const reconstructedDays = series.filter((p) => p.source === "reconstructed").length;

  const totals = {
    stars: sumBy(series, (p) => p.new_stars),
    unstars: sumBy(series, (p) => p.unstars),
    forks: sumBy(series, (p) => p.new_forks),
    issuesOpened: sumBy(series, (p) => p.issues_opened),
    issuesClosed: sumBy(series, (p) => p.issues_closed),
    prsOpened: sumBy(series, (p) => p.prs_opened),
    prsMerged: sumBy(series, (p) => p.prs_merged),
    commits: sumBy(series, (p) => p.commits),
    contributors: sumBy(series, (p) => p.new_contributors),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Daily</h1>
        <p className="text-xs text-ink-2">
          One value per IST calendar day. Totals are the last reading before midnight; gains are events with a timestamp inside the day.
          {reconstructedDays > 0 && first && ` ${reconstructedDays} day(s) before ${formatDate(first.ist_date)} are reconstructed from event timestamps.`}
        </p>
      </div>
      <RangeFilter range={range} basePath="/daily" />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="New stars" value={totals.stars} hint={totals.unstars ? `${formatInt(totals.unstars)} unstarred` : undefined} />
        <StatTile label="New forks" value={totals.forks} />
        <StatTile label="Issues opened / closed" valueText={`${formatInt(totals.issuesOpened)} / ${formatInt(totals.issuesClosed)}`} value={null} />
        <StatTile label="PRs opened / merged" valueText={`${formatInt(totals.prsOpened)} / ${formatInt(totals.prsMerged)}`} value={null} />
        <StatTile label="Commits" value={totals.commits} />
        <StatTile label="New contributors" value={totals.contributors} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Stars" subtitle="Total at end of day">
          <TimeSeriesChart data={rows} series={[{ key: "stars", label: "Stars", color: "var(--series-1)", type: "area" }]} zeroBased={false} />
        </Card>
        <Card title="New stars per day" subtitle="With trailing 7-day average">
          <TimeSeriesChart
            data={rows}
            series={[
              { key: "new_stars", label: "New stars", color: "var(--series-1)", type: "bar" },
              { key: "avg7", label: "7-day average", color: "var(--series-gray)", type: "line" },
            ]}
          />
        </Card>
        <Card title="Forks" subtitle="Total at end of day">
          <TimeSeriesChart data={rows} series={[{ key: "forks", label: "Forks", color: "var(--series-1)", type: "area" }]} zeroBased={false} />
        </Card>
        <Card title="New forks per day">
          <TimeSeriesChart data={rows} series={[{ key: "new_forks", label: "New forks", color: "var(--series-1)", type: "bar" }]} />
        </Card>
        <Card title="Issues opened vs closed">
          <TimeSeriesChart
            data={rows}
            series={[
              { key: "issues_opened", label: "Opened", color: "var(--series-1)", type: "bar" },
              { key: "issues_closed", label: "Closed", color: "var(--series-2)", type: "bar" },
            ]}
          />
        </Card>
        <Card title="Open issues" subtitle="Backlog at end of day">
          <TimeSeriesChart data={rows} series={[{ key: "open_issues", label: "Open issues", color: "var(--series-1)", type: "line" }]} zeroBased={false} />
        </Card>
        <Card title="PRs opened vs merged">
          <TimeSeriesChart
            data={rows}
            series={[
              { key: "prs_opened", label: "Opened", color: "var(--series-1)", type: "bar" },
              { key: "prs_merged", label: "Merged", color: "var(--series-2)", type: "bar" },
            ]}
          />
        </Card>
        <Card title="Open PRs" subtitle="Backlog at end of day">
          <TimeSeriesChart data={rows} series={[{ key: "open_prs", label: "Open PRs", color: "var(--series-1)", type: "line" }]} zeroBased={false} />
        </Card>
        <Card title="Commits per day" subtitle="On the default branch">
          <TimeSeriesChart data={rows} series={[{ key: "commits", label: "Commits", color: "var(--series-1)", type: "bar" }]} />
        </Card>
        <Card title="New contributors per day" subtitle="First commit on the default branch">
          <TimeSeriesChart data={rows} series={[{ key: "new_contributors", label: "New contributors", color: "var(--series-1)", type: "bar" }]} />
        </Card>
      </div>

      <Card title="Table view" subtitle="Every value plotted above, newest first">
        <details>
          <summary className="cursor-pointer text-xs text-ink-2">Show {series.length} rows</summary>
          <div className="mt-2">
            <DataTable
              rows={[...rows].reverse()}
              rowKey={(r) => r.date}
              dense
              columns={[
                { key: "date", label: "Date", render: (r) => <span>{formatDate(r.date)}{r.source === "reconstructed" ? <span className="ml-1 text-muted" title="Reconstructed">*</span> : null}</span> },
                { key: "stars", label: "Stars", align: "right", render: (r) => formatInt(r.stars) },
                { key: "new_stars", label: "+Stars", align: "right", render: (r) => formatInt(r.new_stars) },
                { key: "forks", label: "Forks", align: "right", render: (r) => formatInt(r.forks) },
                { key: "new_forks", label: "+Forks", align: "right", render: (r) => formatInt(r.new_forks) },
                { key: "open_issues", label: "Open issues", align: "right", render: (r) => formatInt(r.open_issues) },
                { key: "issues_opened", label: "Opened", align: "right", render: (r) => formatInt(r.issues_opened) },
                { key: "issues_closed", label: "Closed", align: "right", render: (r) => formatInt(r.issues_closed) },
                { key: "open_prs", label: "Open PRs", align: "right", render: (r) => formatInt(r.open_prs) },
                { key: "prs_opened", label: "PRs opened", align: "right", render: (r) => formatInt(r.prs_opened) },
                { key: "prs_merged", label: "PRs merged", align: "right", render: (r) => formatInt(r.prs_merged) },
                { key: "commits", label: "Commits", align: "right", render: (r) => formatInt(r.commits) },
                { key: "new_contributors", label: "New contrib.", align: "right", render: (r) => formatInt(r.new_contributors) },
                { key: "contributors", label: "Contributors", align: "right", render: (r) => formatInt(r.contributors) },
              ]}
            />
            {reconstructedDays > 0 && <p className="mt-2 text-xs text-muted">* reconstructed from event timestamps (no snapshot that day)</p>}
          </div>
        </details>
      </Card>
    </div>
  );
}
