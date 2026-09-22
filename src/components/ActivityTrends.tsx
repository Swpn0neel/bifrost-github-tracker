"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/Card";
import { TimeSeriesChart, type ChartSeries } from "@/components/TimeSeriesChart";
import { formatInt } from "@/lib/format";
import { formatDate, formatMonth, formatShortDate } from "@/lib/time";
import { periodEnd, trendDataStart, trendWindow, type MonthlyFill, type TrendGroup, type TrendMetric, type TrendRow } from "@/lib/trends";
import { cn } from "@/lib/utils";
import { RangeControls, useTrendRange, type PresetKey } from "./TrendControls";

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

const TITLES: Record<TrendGroup, string> = { day: "Daily activity", week: "Weekly activity", month: "Monthly activity" };

interface ActivityTrendsProps {
  /** One row per IST day, oldest first, with no gaps, ending today. */
  days: TrendRow[];
  /** Per-month values ("YYYY-MM") from an outside source, for months whose days are not all known. */
  monthly?: MonthlyFill;
  /** Caveat about where the star numbers come from. */
  starsNote?: ReactNode;
  /** What one point on the chart covers. Fixed per card: a daily chart stays daily whatever the range. */
  group: TrendGroup;
  /** Range the card opens on; falls back to "all" when the history is shorter than it. */
  defaultPreset?: PresetKey;
  /** Range options to offer, for a card meant for long or short views. Defaults to all of them. */
  presets?: readonly PresetKey[];
}

export function ActivityTrends({ days, monthly, starsNote, group, defaultPreset = "60d", presets }: ActivityTrendsProps) {
  const dataStart = trendDataStart(days, monthly ?? {}, group);
  const today = days[days.length - 1]?.date ?? "";
  const rangeState = useTrendRange(dataStart, today, defaultPreset, presets);
  const [hidden, setHidden] = useState<ReadonlySet<TrendMetric>>(() => new Set(METRICS.filter((m) => !m.defaultOn).map((m) => m.key)));

  const { rows, from, to } = trendWindow(days, rangeState.range.from, rangeState.range.to, group, monthly);
  const last = rows[rows.length - 1];
  const partialLast = last !== undefined && periodEnd(last.date, group) >= today;

  const toggle = (key: TrendMetric) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (days.length === 0) {
    return (
      <Card title={TITLES[group]}>
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      </Card>
    );
  }

  const visible: ChartSeries[] = METRICS.filter((m) => !hidden.has(m.key)).map((m) => ({ key: m.key, label: m.label, color: m.color, type: "line" }));

  const formatX = group === "month" ? formatMonth : formatShortDate;
  const formatXLong = (v: string) => {
    const name = group === "month" ? formatMonth(v) : group === "week" ? `Week of ${formatDate(v)}` : formatDate(v);
    return partialLast && v === last?.date ? `${name} · so far` : name;
  };

  return (
    // In a row of cards the chart sits at the bottom, so charts line up even when the chips wrap differently.
    <Card
      contentClassName="flex flex-1 flex-col"
      title={TITLES[group]}
      subtitle={`New stars, forks, issues, PRs and commits per ${group}, ${from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`} (IST).`}
    >
      <RangeControls state={rangeState} current={{ from, to }} />

      <ul className="mb-4 flex flex-wrap content-start gap-1.5" aria-label="Metrics">
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

      <div className="mt-auto">
        {visible.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Pick a metric above to draw its line.</div>
        ) : (
          <TimeSeriesChart data={rows} series={visible} height={300} legend={false} partialLast={partialLast} formatX={formatX} formatXLong={formatXLong} />
        )}

        <p className="mt-3 text-xs text-pretty text-muted-foreground">
          Click a metric to show or hide its line; its number is the total for the range.
          {partialLast && ` The dashed end is the ${group} still in progress.`}
          {starsNote && <> {starsNote}</>}
        </p>
      </div>
    </Card>
  );
}
