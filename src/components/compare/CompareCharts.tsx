"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { TimeSeriesChart, type ChartSeries } from "@/components/TimeSeriesChart";
import { RangeControls, Segmented, useTrendRange, type PresetKey } from "@/components/TrendControls";
import { COMPARE_METRICS } from "@/lib/compare-ui";
import { formatInt } from "@/lib/format";
import { formatDate, formatMonth, formatShortDate } from "@/lib/time";
import { periodEnd, trendDataStart, trendWindow, type MonthlyFill, type TrendGroup, type TrendMetric, type TrendRow } from "@/lib/trends";
import { cn } from "@/lib/utils";

export interface CompareSeries {
  key: string;
  label: string;
  color: string;
  primary: boolean;
  /** One row per IST day, oldest first, no gaps, ending today; empty when the repo has no data yet. */
  days: TrendRow[];
  monthly: MonthlyFill;
}

type View = "per" | "cumulative";

const TITLES: Record<TrendGroup, string> = { day: "Daily comparison", week: "Weekly comparison", month: "Monthly comparison" };

interface CompareTrendsProps {
  series: CompareSeries[];
  group: TrendGroup;
  today: string;
  defaultPreset: PresetKey;
  presets: readonly PresetKey[];
}

function CompareTrends({ series, group, today, defaultPreset, presets }: CompareTrendsProps) {
  const withData = series.filter((s) => s.days.length > 0);
  const dataStart = withData.map((s) => trendDataStart(s.days, s.monthly, group)).sort()[0] ?? today;
  const rangeState = useTrendRange(dataStart, today, defaultPreset, presets);
  const [metric, setMetric] = useState<TrendMetric>("stars");
  const [view, setView] = useState<View>("per");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  // Each repo's periods over the range (clamped to its own data), then one chart row per period.
  const windows = withData.map((s) => ({ s, w: trendWindow(s.days, rangeState.range.from, rangeState.range.to, group, s.monthly) }));
  const from = windows.map(({ w }) => w.from).sort()[0] ?? rangeState.range.from;
  const to = windows.map(({ w }) => w.to).sort().at(-1) ?? rangeState.range.to;
  const dates = [...new Set(windows.flatMap(({ w }) => w.rows.map((r) => r.date)))].sort();
  const values = windows.map(({ s, w }) => ({ key: s.key, byDate: new Map(w.rows.map((r) => [r.date, r[metric]])) }));

  // Cumulative: the running total from a repo's first known period in the range; a period with no reading adds nothing.
  const running = new Map<string, number | null>();
  const rows = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const { key, byDate } of values) {
      const v = byDate.get(date) ?? null;
      if (view === "per") row[key] = v;
      else {
        const acc = running.get(key) ?? null;
        const next = v === null ? acc : (acc ?? 0) + v;
        running.set(key, next);
        row[key] = next;
      }
    }
    return row;
  });
  const last = dates[dates.length - 1];
  const partialLast = last !== undefined && periodEnd(last, group) >= today;

  const totals = series.map((s) => {
    const byDate = values.find((v) => v.key === s.key)?.byDate;
    const known = byDate ? [...byDate.values()].filter((v): v is number => v !== null) : [];
    const unknown = byDate ? byDate.size - known.length : 0;
    return { key: s.key, total: known.length ? known.reduce((a, b) => a + b, 0) : null, unknown, empty: s.days.length === 0 };
  });
  const gaps = totals.filter((t) => !hidden.has(t.key) && t.unknown > 0).length > 0;

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const metricInfo = COMPARE_METRICS.find((m) => m.key === metric) ?? COMPARE_METRICS[0];
  const visible: ChartSeries[] = series.filter((s) => !hidden.has(s.key) && s.days.length > 0).map((s) => ({ key: s.key, label: s.label, color: s.color, type: "line" }));
  const formatX = group === "month" ? formatMonth : formatShortDate;
  const formatXLong = (v: string) => {
    const name = group === "month" ? formatMonth(v) : formatDate(v);
    return partialLast && v === last ? `${name} · so far` : name;
  };
  const span = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <Card
      contentClassName="flex flex-1 flex-col"
      title={TITLES[group]}
      subtitle={view === "per" ? `${metricInfo.noun[0].toUpperCase()}${metricInfo.noun.slice(1)} per ${group} for each repository, ${span} (IST).` : `${metricInfo.noun[0].toUpperCase()}${metricInfo.noun.slice(1)} gained since ${formatDate(from)}, per repository, to ${formatDate(to)} (IST).`}
    >
      <RangeControls state={rangeState} current={{ from, to }} />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Metric" value={metric} options={COMPARE_METRICS} onChange={setMetric} />
        <Segmented
          label="View"
          value={view}
          options={[
            { key: "per", label: group === "month" ? "Per month" : "Per day" },
            { key: "cumulative", label: "Cumulative" },
          ]}
          onChange={setView}
        />
      </div>

      <ul className="mb-4 flex flex-wrap content-start gap-1.5" aria-label="Repositories">
        {series.map((s) => {
          const t = totals.find((x) => x.key === s.key)!;
          const on = !hidden.has(s.key) && !t.empty;
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={on}
                disabled={t.empty}
                onClick={() => toggle(s.key)}
                title={t.empty ? "No readings yet" : t.unknown ? `${t.unknown} ${group}${t.unknown === 1 ? "" : "s"} in this range without a reading` : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                  on ? "bg-background text-foreground hover:bg-muted/60" : "border-dashed text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("inline-block h-0.5 w-3.5 shrink-0 rounded-sm", !on && "opacity-40")} style={{ background: on ? s.color : "var(--series-gray)" }} />
                <span className={cn(!on && "line-through decoration-muted-foreground/50")}>{s.label}</span>
                <span className={cn("font-mono font-medium tnum", !on && "opacity-60")}>{t.total === null ? "—" : formatInt(t.total)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto">
        {visible.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Pick a repository above to draw its line.</div>
        ) : (
          <TimeSeriesChart data={rows} series={visible} height={300} legend={false} partialLast={partialLast} formatX={formatX} formatXLong={formatXLong} />
        )}
        <p className="mt-3 text-xs text-pretty text-muted-foreground">
          Click a repository to show or hide its line; its number is the total for the range.
          {partialLast && ` The dashed end is the ${group} still in progress.`}
          {gaps && ` A ${group} without a reading is left out of a total and adds nothing to a cumulative line.`}
        </p>
      </div>
    </Card>
  );
}

/** The daily and monthly comparison cards, drawn from one set of series. */
export function CompareCharts({ series, today }: { series: CompareSeries[]; today: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CompareTrends series={series} group="day" today={today} defaultPreset="30d" presets={["7d", "30d", "60d", "90d", "6m", "custom"]} />
      <CompareTrends series={series} group="month" today={today} defaultPreset="1y" presets={["6m", "1y", "2y", "all", "custom"]} />
    </div>
  );
}
