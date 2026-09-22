import { CircleDot, ExternalLink, Eye, GitFork, GitPullRequest, MessagesSquare, Rocket, Star, Tag, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTrends } from "@/components/ActivityTrends";
import { Card } from "@/components/Card";
import { RemoveRepoButton } from "@/components/compare/RemoveRepoButton";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { comparedRepo, findTrackedRepo, toTrendRows, type RepoDay } from "@/lib/compare";
import { signed } from "@/lib/format";
import { rollingMean } from "@/lib/stats";
import { formatDate, formatIstDateTime, istDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The day-close total `back` days ago; "yesterday" must be an actual reading, longer spans may be estimates. */
function known(days: RepoDay[], back: number, key: "stars" | "forks"): number | null {
  const d = days[days.length - 1 - back];
  if (!d || (back === 1 && d.source !== "snapshot")) return null;
  return d[key];
}

export default async function ComparedRepoPage({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  const repo = await findTrackedRepo(`${owner}/${name}`);
  if (!repo) notFound();
  const today = istDate();
  const c = await comparedRepo(repo, today);
  const { live, days } = c;

  const stars = live?.stars ?? null;
  const yday = known(days, 1, "stars");
  const week = known(days, 7, "stars");
  const month = known(days, 30, "stars");
  const gain7 = stars !== null && week !== null ? stars - week : null;
  const gain30 = stars !== null && month !== null ? stars - month : null;
  const forksYday = known(days, 1, "forks");

  const recent = days.slice(-31);
  const avg7 = rollingMean(
    recent.map((d) => d.new_stars),
    7,
  );
  const starRows = recent.map((d, i) => ({ date: d.date, stars: d.stars, new_stars: d.new_stars, avg7: avg7[i] === null ? null : Math.round(avg7[i] * 10) / 10 }));
  const estimatedDays = days.filter((d) => d.gains_estimated || d.stars_estimated).length;
  const trendshift = c.trendshift_id ? (
    <a href={`https://trendshift.io/repositories/${c.trendshift_id}`} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
      Trendshift
    </a>
  ) : (
    "Trendshift"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={`https://github.com/${c.full_name}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
              {c.full_name}
              <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
            </a>
            {c.language && <Badge variant="outline">{c.language}</Badge>}
          </span>
        }
        description={
          <>
            {c.description ? `${c.description} ` : ""}
            Compared against the baseline on the <Link href="/compare" className="text-link underline-offset-2 hover:underline">Compare</Link> page
            {c.added_at ? `; added ${formatDate(c.added_at.slice(0, 10))}` : ""}.
          </>
        }
      >
        <RemoveRepoButton id={repo.id} fullName={c.full_name} afterRemove="/compare" />
      </PageHeader>

      {!live && (
        <Alert>
          <Rocket />
          <AlertTitle>No readings yet</AlertTitle>
          <AlertDescription>The next collector run (or the Refresh button) takes the first one.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <StatTile
          label="Stars"
          icon={<Star />}
          value={stars}
          hero
          delta={stars !== null && yday !== null ? stars - yday : null}
          deltaLabel="today so far"
          upIsGood
          trend={days
            .slice(-14)
            .map((d) => d.stars)
            .filter((v): v is number => v !== null)}
          hint={`${signed(gain7)} in 7 d · ${signed(gain30)} in 30 d`}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="Forks" icon={<GitFork />} value={live?.forks} delta={live && forksYday !== null ? (live.forks ?? 0) - forksYday : null} deltaLabel="today" upIsGood />
          <StatTile label="Watchers" icon={<Eye />} value={live?.watchers} />
          <StatTile label="Open issues" icon={<CircleDot />} value={live?.open_issues} />
          <StatTile label="Open PRs" icon={<GitPullRequest />} value={live?.open_prs} />
          <StatTile label="Contributors" icon={<Users />} value={live?.contributors} />
          <StatTile label="Releases" icon={<Tag />} value={live?.releases} hint={live?.discussions != null ? `${live.discussions.toLocaleString("en-US")} discussions` : undefined} />
        </div>
      </div>

      <section aria-label="Repository activity" className="space-y-2">
        <div className="grid gap-4 xl:grid-cols-2">
          <ActivityTrends group="day" days={toTrendRows(days)} monthly={c.monthly} defaultPreset="60d" presets={["7d", "30d", "60d", "90d", "6m", "custom"]} />
          <ActivityTrends group="month" days={toTrendRows(days)} monthly={c.monthly} defaultPreset="2y" presets={["6m", "1y", "2y", "all", "custom"]} />
        </div>
        <p className="px-1 text-xs text-pretty text-muted-foreground">
          {c.first_snapshot ? `Readings four times a day since ${formatDate(c.first_snapshot)}; activity is the change between day-close readings (IST).` : "No readings yet."}
          {estimatedDays > 0 && <> Days before that come from {trendshift} (UTC days) as estimates; it has no PRs-opened or commit counts, so those start with our readings.</>}
          {estimatedDays === 0 && c.first_snapshot && !c.trendshift_id && (
            <>
              {" "}
              No Trendshift link was given, so daily star history starts with the first reading; to add one later run <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">npm run import:history -- --trendshift &lt;id&gt; --repo {c.full_name}</code>.
            </>
          )}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Stars, last 30 days" subtitle={estimatedDays > 0 ? <>Day-close readings; earlier days counted back from the first reading using {trendshift}&apos;s daily gains (estimate)</> : "Day-close readings"}>
          <TimeSeriesChart data={starRows} series={[{ key: "stars", label: "Stars", color: "var(--series-1)", type: "area" }]} zeroBased={false} />
        </Card>
        <Card title="New stars per day" subtitle="Net change between day-close readings, with a trailing 7-day average">
          <TimeSeriesChart
            data={starRows}
            series={[
              { key: "new_stars", label: "Net new stars", color: "var(--series-1)", type: "bar" },
              { key: "avg7", label: "7-day average", color: "var(--series-gray)", type: "line" },
            ]}
          />
        </Card>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        <MessagesSquare className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        Latest reading: {live ? formatIstDateTime(live.captured_at) : "none yet"}.
      </p>
    </div>
  );
}
