"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { TimeSeriesChart, type ChartSeries } from "@/components/TimeSeriesChart";
import { formatInt } from "@/lib/format";
import { formatDate, formatMonth, formatShortDate } from "@/lib/time";
import type { TrendMetric, TrendRow } from "@/lib/trends";
import { cn } from "@/lib/utils";

// Colour follows the metric, so hiding a line never repaints the ones that stay.
const METRICS: { key: TrendMetric; label: string; color: string; defaultOn: boolean }[] = [
  { key: "stars", label: "Stars", color: "var(--series-1)", defaultOn: true },
  { key: "forks", label: "Forks", color: "var(--series-2)", defaultOn: true },
  { key: "issues_opened", label: "Issues opened", color: "var(--series-3)", defaultOn: true },
  { key: "issues_closed", label: "Issues closed", color: "var(--series-4)", defaultOn: true },
  { key: "prs_opened", label: "PRs opened", color: "var(--series-5)", defaultOn: false },
  { key: "prs_merged", label: "PRs merged", color: "var(--series-6)", defaultOn: true },
  { key: "commits", label: "Commits", color: "var(--series-7)", defaultOn: false },
];

const VIEWS = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
] as const;
type View = (typeof VIEWS)[number]["key"];

interface ActivityTrendsProps {
  daily: TrendRow[];
  monthly: TrendRow[];
  /** Shown when star gains only exist from the first snapshot onwards. */
  starsNote?: string;
}

export function ActivityTrends({ daily, monthly, starsNote }: ActivityTrendsProps) {
  const [view, setView] = useState<View>("daily");
  const [hidden, setHidden] = useState<ReadonlySet<TrendMetric>>(() => new Set(METRICS.filter((m) => !m.defaultOn).map((m) => m.key)));

  const rows = view === "daily" ? daily : monthly;
  const visible: ChartSeries[] = METRICS.filter((m) => !hidden.has(m.key)).map((m) => ({ key: m.key, label: m.label, color: m.color, type: "line" }));

  const toggle = (key: TrendMetric) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const span = view === "daily" ? `per day over the last ${daily.length} days` : `per month over the last ${monthly.length} months`;

  return (
    <Card
      title="Repository activity"
      subtitle={`New stars, forks, issues and PRs ${span} (IST). Click a metric to show or hide its line.${starsNote ? ` ${starsNote}` : ""}`}
      action={
        <div role="group" aria-label="Granularity" className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "inline-flex h-full items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                view === v.key ? "bg-background text-foreground shadow-sm dark:bg-input/50" : "hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      }
    >
      <ul className="mb-4 flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const on = !hidden.has(m.key);
          const known = rows.filter((r) => r[m.key] !== null);
          const total = known.reduce((acc, r) => acc + (r[m.key] ?? 0), 0);
          return (
            <li key={m.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(m.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-background text-foreground hover:bg-muted/60" : "border-dashed text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("inline-block h-0.5 w-3.5 shrink-0 rounded-sm", !on && "opacity-40")} style={{ background: on ? m.color : "var(--series-gray)" }} />
                <span className={cn(!on && "line-through decoration-muted-foreground/50")}>{m.label}</span>
                <span className={cn("font-mono font-medium tnum", !on && "opacity-60")}>{known.length ? formatInt(total) : "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Pick a metric above to draw its line.</div>
      ) : (
        <TimeSeriesChart
          data={rows}
          series={visible}
          height={300}
          legend={false}
          formatX={view === "daily" ? formatShortDate : formatMonth}
          formatXLong={view === "daily" ? formatDate : formatMonth}
        />
      )}
    </Card>
  );
}
