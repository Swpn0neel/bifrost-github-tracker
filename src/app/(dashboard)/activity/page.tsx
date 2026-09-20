import { GitCommitHorizontal, Tag, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { HorizontalBars } from "@/components/HorizontalBars";
import { PageHeader } from "@/components/PageHeader";
import { RangeFilter } from "@/components/RangeFilter";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { fixed, formatInt } from "@/lib/format";
import { dailySeries, dataStartDate, latestSnapshot, releasesIn, topContributors } from "@/lib/queries";
import { resolveRange, type SearchParams } from "@/lib/range";
import { sumBy } from "@/lib/stats";
import { formatIstDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const dataStart = await dataStartDate();
  const range = resolveRange(sp, dataStart, "90d");
  const [series, contributors, releases, latest] = await Promise.all([
    dailySeries(range.from, range.to),
    topContributors(range.from, range.to, 15),
    releasesIn(range.from, range.to, 60),
    latestSnapshot(),
  ]);
  const last = series[series.length - 1];
  const commits = sumBy(series, (p) => p.commits);
  const newContributors = sumBy(series, (p) => p.new_contributors);
  const releasesCount = sumBy(series, (p) => p.releases_published);
  const stable = releases.filter((r) => !r.prerelease).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Commits on the default branch, contributor growth and release cadence." />
      <RangeFilter range={range} basePath="/activity" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile icon={<GitCommitHorizontal />} label="Commits in range" value={commits} hint={`${fixed(commits / range.days)} per day`} />
        <StatTile icon={<UserPlus />} label="New contributors in range" value={newContributors} hint={`${formatInt(latest?.contributors ?? last.contributors)} total`} />
        <StatTile icon={<Tag />} label="Releases in range" value={releasesCount} hint={`${formatInt(stable)} stable · ${formatInt(releases.length - stable)} pre-release (of ${releases.length} listed)`} />
        <StatTile icon={<Users />} label="Active contributors" value={contributors.length} hint="With at least one commit in range (top 15 shown)" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Commits per day">
          <TimeSeriesChart data={series} series={[{ key: "commits", label: "Commits", color: "var(--series-1)", type: "bar" }]} />
        </Card>
        <Card title="New contributors per day" subtitle="First commit on the default branch">
          <TimeSeriesChart data={series} series={[{ key: "new_contributors", label: "New contributors", color: "var(--series-1)", type: "bar" }]} />
        </Card>
        <Card title="Releases per day" subtitle="Published, excluding drafts">
          <TimeSeriesChart data={series} series={[{ key: "releases_published", label: "Releases", color: "var(--series-1)", type: "bar" }]} />
        </Card>
        <Card title="Top contributors in range" subtitle="Commits on the default branch">
          <HorizontalBars
            items={contributors.map((c) => ({ label: c.author_login, value: c.commits, href: `https://github.com/${c.author_login}` }))}
            emptyText="Run the backfill to load commits"
          />
        </Card>
      </div>

      <Card title="Releases" subtitle={`Newest first, up to 60 in range`}>
        <DataTable
          rows={releases}
          rowKey={(r) => r.tag}
          dense
          emptyText="No releases in range (or backfill not run yet)"
          columns={[
            {
              key: "tag",
              label: "Tag",
              className: "whitespace-nowrap",
              render: (r) => (
                <a href={`https://github.com/${env.repo}/releases/tag/${encodeURIComponent(r.tag)}`} target="_blank" rel="noreferrer" className="font-medium text-link underline-offset-4 hover:underline">
                  {r.tag}
                </a>
              ),
            },
            { key: "name", label: "Name", render: (r) => <span className="line-clamp-1">{r.name ?? "—"}</span> },
            { key: "kind", label: "Kind", render: (r) => <Badge variant={r.prerelease ? "outline" : "secondary"}>{r.prerelease ? "pre-release" : "stable"}</Badge> },
            { key: "published_at", label: "Published", className: "whitespace-nowrap", render: (r) => formatIstDateTime(r.published_at) },
          ]}
        />
      </Card>
    </div>
  );
}
