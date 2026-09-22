import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { AddRepoForm } from "@/components/compare/AddRepoForm";
import { CompareCharts, type CompareSeries } from "@/components/compare/CompareCharts";
import { RepoChips, type RepoChip } from "@/components/compare/RepoChips";
import { DataTable } from "@/components/DataTable";
import { Hint } from "@/components/Hint";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { comparedRepos, toTrendRows, type ComparedRepo, type RepoDay } from "@/lib/compare";
import { repoColor } from "@/lib/compare-ui";
import { fixed, formatInt, signed } from "@/lib/format";
import { formatDate, formatIstDateTime, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Row {
  key: string;
  full_name: string;
  primary: boolean;
  href: string;
  color: string;
  id: number | null;
  stars: number | null;
  today: number | null;
  gain7: number | null;
  gain30: number | null;
  perDay: number | null;
  forks: number | null;
  forks7: number | null;
  open_issues: number | null;
  open_prs: number | null;
  contributors: number | null;
  releases: number | null;
  since: string | null;
  first_snapshot: string | null;
  captured_at: Date | null;
}

/**
 * Change from the day-close total `back` days ago to the live number, when that total is known.
 * "Today" needs an actual reading to measure from; longer spans may start from an estimated total.
 */
function gain(live: number | null, days: ComparedRepo["days"], back: number, key: "stars" | "forks"): number | null {
  const then = days[days.length - 1 - back];
  if (live === null || !then || then[key] === null) return null;
  if (back === 1 && then.source !== "snapshot") return null;
  return live - (then[key] as number);
}

function toRow(r: ComparedRepo, i: number): Row {
  const live = r.live;
  const stars = live?.stars ?? null;
  const gain7 = gain(stars, r.days, 7, "stars");
  return {
    key: r.key,
    full_name: r.full_name,
    primary: r.primary,
    href: r.href,
    color: repoColor(i),
    id: r.primary ? null : Number(r.key.replace("repo-", "")),
    stars,
    today: gain(stars, r.days, 1, "stars"),
    gain7,
    gain30: gain(stars, r.days, 30, "stars"),
    perDay: gain7 === null ? null : gain7 / 7,
    forks: live?.forks ?? null,
    forks7: gain(live?.forks ?? null, r.days, 7, "forks"),
    open_issues: live?.open_issues ?? null,
    open_prs: live?.open_prs ?? null,
    contributors: live?.contributors ?? null,
    releases: live?.releases ?? null,
    since: r.data_start,
    first_snapshot: r.first_snapshot,
    captured_at: live?.captured_at ?? null,
  };
}

const delta = (n: number | null) => <span className={cn("tnum", n === null ? "text-muted-foreground" : n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-muted-foreground")}>{signed(n)}</span>;

export default async function ComparePage() {
  const today = istDate();
  const repos = await comparedRepos(today);
  const rows = repos.map(toRow);
  const others = repos.filter((r) => !r.primary);
  const chips: RepoChip[] = rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    color: r.color,
    href: r.href,
    primary: r.primary,
    note: r.captured_at ? undefined : "no readings yet",
  }));
  // Known end-of-day totals, the bases of the "% of total" scale.
  const totalsOf = (days: RepoDay[], key: "stars" | "forks") => Object.fromEntries(days.filter((d) => d[key] !== null).map((d) => [d.date, d[key] as number]));
  const series: CompareSeries[] = repos.map((r, i) => ({
    key: r.key,
    label: r.full_name,
    color: repoColor(i),
    primary: r.primary,
    days: toTrendRows(r.days),
    monthly: r.monthly,
    totals: { stars: totalsOf(r.days, "stars"), forks: totalsOf(r.days, "forks") },
  }));
  const estimated = others.some((r) => r.days.some((d) => d.gains_estimated));

  return (
    <div className="space-y-6">
      <PageHeader title="Compare" description="Other repositories read at the same four times a day, next to the baseline. Add any public GitHub repository; it gets its first reading straight away.">
        <AddRepoForm />
      </PageHeader>

      <RepoChips repos={chips} />

      <Card title="Side by side" subtitle="Live numbers from the latest reading. Gains are measured from the day-close readings (IST); a dash means that day has no reading to measure from.">
        <DataTable
          rows={rows}
          rowKey={(r) => r.key}
          dense
          rowClassName={(r) => (r.primary ? "bg-muted/50" : undefined)}
          columns={[
            {
              key: "repo",
              label: "Repository",
              className: "whitespace-nowrap",
              render: (r) => (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                  <Link href={r.href} prefetch={false} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {r.full_name}
                  </Link>
                  {r.primary && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      baseline
                    </Badge>
                  )}
                </span>
              ),
            },
            { key: "stars", label: "Stars", align: "right", render: (r) => <span className="font-medium">{formatInt(r.stars)}</span> },
            { key: "today", label: "Today", align: "right", render: (r) => delta(r.today) },
            { key: "gain7", label: "7 d", align: "right", render: (r) => delta(r.gain7) },
            { key: "gain30", label: "30 d", align: "right", render: (r) => delta(r.gain30) },
            { key: "perDay", label: "Per day", align: "right", className: "whitespace-nowrap", render: (r) => <Hint text="Average over the last 7 days"><span>{fixed(r.perDay)}</span></Hint> },
            {
              key: "forks",
              label: "Forks",
              align: "right",
              className: "whitespace-nowrap",
              render: (r) => (
                <span>
                  {formatInt(r.forks)} <span className="text-xs text-muted-foreground">{r.forks7 === null ? "" : `(${signed(r.forks7)} in 7 d)`}</span>
                </span>
              ),
            },
            { key: "open_issues", label: "Open issues", align: "right", render: (r) => formatInt(r.open_issues) },
            { key: "open_prs", label: "Open PRs", align: "right", render: (r) => formatInt(r.open_prs) },
            { key: "contributors", label: "Contributors", align: "right", render: (r) => formatInt(r.contributors) },
            { key: "releases", label: "Releases", align: "right", render: (r) => formatInt(r.releases) },
            {
              key: "since",
              label: "Data since",
              className: "whitespace-nowrap text-muted-foreground",
              render: (r) => (
                <Hint text={r.first_snapshot ? `Own readings since ${formatDate(r.first_snapshot)}${r.captured_at ? `; latest ${formatIstDateTime(r.captured_at)}` : ""}` : "No readings yet"}>
                  <span>{r.since ? formatDate(r.since) : "—"}</span>
                </Hint>
              ),
            },
          ]}
        />
      </Card>

      <CompareCharts series={series} today={today} />

      <p className="px-1 text-xs text-pretty text-muted-foreground">
        Compared repositories get headline readings only, so their daily activity is the change between day-close readings, and their totals only run from the day they were added
        {estimated && (
          <>
            ; earlier days come from{" "}
            <a href="https://trendshift.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-link underline-offset-2 hover:underline">
              Trendshift <ExternalLink className="size-3" aria-hidden />
            </a>{" "}
            (UTC days) as estimates
          </>
        )}
        . Stars are net of unstars everywhere. Removing a repository keeps its readings.
      </p>
    </div>
  );
}
