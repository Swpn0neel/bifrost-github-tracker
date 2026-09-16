import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { HorizontalBars } from "@/components/HorizontalBars";
import { RangeFilter } from "@/components/RangeFilter";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { env } from "@/lib/env";
import { daysLabel, formatInt, pct } from "@/lib/format";
import {
  dailySeries,
  dataStartDate,
  issueStats,
  latestSnapshot,
  mostDiscussedOpenIssues,
  oldestOpenIssues,
  openAgeBuckets,
  openIssueLabels,
  type IssueListRow,
} from "@/lib/queries";
import { resolveRange, type SearchParams } from "@/lib/range";
import { formatIstDateTime, formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

const ORD = ["var(--ord-1)", "var(--ord-2)", "var(--ord-3)", "var(--ord-4)"];

function issueColumns(repo: string) {
  return [
    {
      key: "number",
      label: "#",
      render: (r: IssueListRow) => (
        <a href={`https://github.com/${repo}/issues/${r.number}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {r.number}
        </a>
      ),
    },
    { key: "title", label: "Title", render: (r: IssueListRow) => <span className="line-clamp-1" title={r.title}>{r.title}</span> },
    { key: "author", label: "Author", render: (r: IssueListRow) => r.author ?? "—" },
    { key: "age", label: "Opened", render: (r: IssueListRow) => <span title={formatIstDateTime(r.created_at)}>{formatRelative(r.created_at)}</span> },
    { key: "comments", label: "Comments", align: "right" as const, render: (r: IssueListRow) => formatInt(r.comments) },
  ];
}

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const dataStart = await dataStartDate();
  const range = resolveRange(sp, dataStart, "90d");
  const [series, stats, latest, issueAges, prAges, labels, oldest, discussed] = await Promise.all([
    dailySeries(range.from, range.to),
    issueStats(range.from, range.to),
    latestSnapshot(),
    openAgeBuckets("issue"),
    openAgeBuckets("pr"),
    openIssueLabels(12),
    oldestOpenIssues(10),
    mostDiscussedOpenIssues(10),
  ]);
  const last = series[series.length - 1];
  const mergeDenominator = stats.prs_merged_n + stats.prs_closed_unmerged_n;
  const cols = issueColumns(env.repo);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Issues &amp; pull requests</h1>
        <p className="text-xs text-ink-2">
          GitHub&apos;s <code>open_issues_count</code> mixes both; these are separated. Medians and counts are scoped to the selected range.
        </p>
      </div>
      <RangeFilter range={range} basePath="/issues" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open issues" value={latest?.open_issues ?? last.open_issues} hint={`${formatInt(latest?.closed_issues ?? last.closed_issues)} closed all-time`} />
        <StatTile label="Issues closed in range" value={stats.issues_closed_n} />
        <StatTile label="Median time to close" valueText={daysLabel(stats.median_issue_close_days)} value={null} hint="Issues closed in range" />
        <StatTile label="Open PRs" value={latest?.open_prs ?? last.open_prs} hint={`${formatInt(latest?.merged_prs ?? last.merged_prs)} merged all-time`} />
        <StatTile label="PRs merged in range" value={stats.prs_merged_n} hint={`${formatInt(stats.prs_closed_unmerged_n)} closed without merge`} />
        <StatTile label="Median time to merge" valueText={daysLabel(stats.median_pr_merge_days)} value={null} hint="PRs merged in range" />
        <StatTile label="Merge rate" valueText={pct(mergeDenominator ? stats.prs_merged_n / mergeDenominator : null)} value={null} hint="Merged ÷ (merged + closed)" />
        <StatTile label="Issues opened in range" value={series.reduce((a, p) => a + p.issues_opened, 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Issues opened vs closed" subtitle="Per IST day">
          <TimeSeriesChart
            data={series}
            series={[
              { key: "issues_opened", label: "Opened", color: "var(--series-1)", type: "bar" },
              { key: "issues_closed", label: "Closed", color: "var(--series-2)", type: "bar" },
            ]}
          />
        </Card>
        <Card title="Open issue backlog" subtitle="At end of day">
          <TimeSeriesChart data={series} series={[{ key: "open_issues", label: "Open issues", color: "var(--series-1)", type: "line" }]} zeroBased={false} />
        </Card>
        <Card title="PRs opened vs merged" subtitle="Per IST day">
          <TimeSeriesChart
            data={series}
            series={[
              { key: "prs_opened", label: "Opened", color: "var(--series-1)", type: "bar" },
              { key: "prs_merged", label: "Merged", color: "var(--series-2)", type: "bar" },
            ]}
          />
        </Card>
        <Card title="Open PR backlog" subtitle="At end of day">
          <TimeSeriesChart data={series} series={[{ key: "open_prs", label: "Open PRs", color: "var(--series-1)", type: "line" }]} zeroBased={false} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Age of open issues" subtitle="Right now">
          <HorizontalBars items={issueAges.map((b, i) => ({ label: b.bucket, value: b.n, color: ORD[i] }))} />
        </Card>
        <Card title="Age of open PRs" subtitle="Right now">
          <HorizontalBars items={prAges.map((b, i) => ({ label: b.bucket, value: b.n, color: ORD[i] }))} />
        </Card>
        <Card title="Labels on open issues" subtitle="Top 12">
          <HorizontalBars
            items={labels.map((l) => ({ label: l.label, value: l.n, href: `https://github.com/${env.repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22${encodeURIComponent(l.label)}%22` }))}
            emptyText="No labelled open issues (or backfill not run yet)"
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Oldest open issues">
          <DataTable rows={oldest} rowKey={(r) => r.number} dense columns={cols} emptyText="Run the backfill to load issues" />
        </Card>
        <Card title="Most discussed open issues">
          <DataTable rows={discussed} rowKey={(r) => r.number} dense columns={cols} emptyText="Run the backfill to load issues" />
        </Card>
      </div>
    </div>
  );
}
