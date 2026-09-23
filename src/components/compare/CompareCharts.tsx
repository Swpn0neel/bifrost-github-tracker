"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { TimeSeriesChart, type ChartSeries } from "@/components/TimeSeriesChart";
import { RangeControls, Segmented, useTrendRange, type PresetKey } from "@/components/TrendControls";
import { COMPARE_METRICS } from "@/lib/compare-ui";
import { formatInt } from "@/lib/format";
import { rollingMean } from "@/lib/stats";
import { addDays, formatDate, formatDateWithDay, formatMonth, formatShortDate, monthStart } from "@/lib/time";
import { periodEnd, periodStart, trendDataStart, trendWindow, type MonthlyFill, type TrendGroup, type TrendMetric, type TrendRow } from "@/lib/trends";
import { cn } from "@/lib/utils";

export interface CompareSeries {
  key: string;
  label: string;
  color: string;
  primary: boolean;
  /** One row per IST day, oldest first, no gaps, ending today; empty when the repo has no data yet. */
  days: TrendRow[];
  monthly: MonthlyFill;
  /** Known end-of-day totals by date, for the "% of total" scale. */
  totals: { stars: Record<string, number>; forks: Record<string, number> };
}

type View = "per" | "avg7" | "cumulative";
type Scale = "count" | "relative";
/** The metrics with a total of their own kind to be measured against. */
type RelativeMetric = "stars" | "forks";

const TITLES: Record<TrendGroup, string> = { day: "Daily comparison", week: "Weekly comparison", month: "Monthly comparison" };
const AVG_WINDOW = 7;

const isRelativeMetric = (m: TrendMetric): m is RelativeMetric => m === "stars" || m === "forks";
const formatPct = (v: number) => `${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}%`;
const lastDayOfMonth = (month: string) => addDays(monthStart(`${month}-01`, 1), -1);

/**
 * The total a period starts from, per period start date. Days take the previous day's
 * close. Months take the close of the previous month's last day, and months before the
 * first known close are counted back through the monthly gains, so the outside source's
 * two years of months get a base too.
 */
function periodBases(s: CompareSeries, metric: RelativeMetric, group: TrendGroup, dataStart: string, today: string): Map<string, number> {
  const totals = s.totals[metric];
  const bases = new Map<string, number>();
  if (group === "day") {
    for (const [date, total] of Object.entries(totals)) bases.set(addDays(date, 1), total);
    return bases;
  }
  if (group !== "month") return bases;
  for (const [date, total] of Object.entries(totals)) if (date === lastDayOfMonth(date.slice(0, 7))) bases.set(monthStart(date, 1), total);
  const gains = new Map(trendWindow(s.days, dataStart, today, "month", s.monthly).rows.map((r) => [r.date, r[metric]]));
  const anchor = [...bases.keys()].sort()[0];
  if (!anchor) return bases;
  let base = bases.get(anchor)!;
  for (let m = addDays(anchor, -1); m >= dataStart.slice(0, 7); m = addDays(monthStart(m), -1)) {
    const start = monthStart(m);
    const gain = gains.get(start);
    if (gain === null || gain === undefined) break;
    base -= gain;
    bases.set(start, base);
  }
  return bases;
}

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
  const [scaleChoice, setScaleChoice] = useState<Scale>("count");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  // "% of total" needs a total of the same kind; other metrics fall back to counts until it is switched back.
  const relativeOk = isRelativeMetric(metric);
  const scale: Scale = scaleChoice === "relative" && relativeOk ? "relative" : "count";
  const smoothing = group === "day" && view === "avg7";

  // Each repo's periods over the range (clamped to its own data). Smoothing reads a week
  // further back so the first days of the range have a full window behind them.
  const rangeFrom = smoothing ? addDays(rangeState.range.from, -(AVG_WINDOW - 1)) : rangeState.range.from;
  const windows = withData.map((s) => ({ s, w: trendWindow(s.days, rangeFrom, rangeState.range.to, group, s.monthly) }));
  const clampFrom = (d: string) => (d < rangeState.range.from ? rangeState.range.from : d);
  const from = clampFrom(windows.map(({ w }) => w.from).sort()[0] ?? rangeState.range.from);
  const to = windows.map(({ w }) => w.to).sort().at(-1) ?? rangeState.range.to;
  const dates = [...new Set(windows.flatMap(({ w }) => w.rows.map((r) => r.date)))].filter((d) => d >= from).sort();

  // Per repo: the gain per period (smoothed if asked), and the base each period is measured against.
  const perRepo = windows.map(({ s, w }) => {
    const rows = w.rows;
    let gains = rows.map((r) => r[metric]);
    if (smoothing) gains = rollingMean(gains, AVG_WINDOW);
    const gainByDate = new Map(rows.map((r, i) => [r.date, gains[i]]));
    const rawByDate = new Map(rows.map((r) => [r.date, r[metric]]));
    const bases = scale === "relative" ? periodBases(s, metric as RelativeMetric, group, trendDataStart(s.days, s.monthly, group), today) : new Map<string, number>();
    // Growth over the range is measured from the first period in it that has a base, which is
    // also where the known gains begin (both come from the same readings and outside days).
    const inRange = rows.filter((r) => r.date >= from);
    const startBase = inRange.map((r) => bases.get(r.date)).find((b) => b !== undefined) ?? null;
    return { key: s.key, gainByDate, rawByDate, bases, startBase };
  });

  const running = new Map<string, number | null>();
  const rows = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const r of perRepo) {
      const gain = r.gainByDate.get(date) ?? null;
      let value: number | null;
      if (view === "cumulative") {
        // A period with no reading adds nothing; the running total starts at the repo's first known period.
        const acc = running.get(r.key) ?? null;
        const raw = r.rawByDate.get(date) ?? null;
        const next = raw === null ? acc : (acc ?? 0) + raw;
        running.set(r.key, next);
        value = next === null ? null : scale === "relative" ? (r.startBase ? (next / r.startBase) * 100 : null) : next;
      } else if (scale === "relative") {
        const base = r.bases.get(date);
        value = gain === null || !base ? null : (gain / base) * 100;
      } else value = gain;
      row[r.key] = value === null ? null : Math.round(value * 1000) / 1000;
    }
    return row;
  });
  const last = dates[dates.length - 1];
  const partialLast = last !== undefined && periodEnd(last, group) >= today;

  // Chip figures: the total for the range, or the growth over it against the total at its start.
  const totals = series.map((s) => {
    const r = perRepo.find((x) => x.key === s.key);
    const known = r ? [...r.rawByDate.entries()].filter(([d, v]) => d >= from && v !== null).map(([, v]) => v as number) : [];
    const inRangeCount = r ? [...r.rawByDate.keys()].filter((d) => d >= from).length : 0;
    const sum = known.length ? known.reduce((a, b) => a + b, 0) : null;
    const value = sum === null ? null : scale === "relative" ? (r?.startBase ? (sum / r.startBase) * 100 : null) : sum;
    return { key: s.key, value, unknown: inRangeCount - known.length, empty: s.days.length === 0 };
  });
  const gaps = totals.some((t) => !hidden.has(t.key) && t.unknown > 0);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const metricInfo = COMPARE_METRICS.find((m) => m.key === metric) ?? COMPARE_METRICS[0];
  const noun = metricInfo.noun;
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const visible: ChartSeries[] = series.filter((s) => !hidden.has(s.key) && s.days.length > 0).map((s) => ({ key: s.key, label: s.label, color: s.color, type: "line" }));
  const formatX = group === "month" ? formatMonth : formatShortDate;
  const formatXLong = (v: string) => {
    const name = group === "month" ? formatMonth(v) : formatDateWithDay(v);
    return partialLast && v === last ? `${name} · so far` : name;
  };
  const span = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
  const unit = group === "month" ? "month" : "day";
  const subtitle =
    view === "cumulative"
      ? scale === "relative"
        ? `Growth in ${metricInfo.label.toLowerCase()} since ${formatDate(periodStart(from, group))}, as a percentage of each repository's total then, to ${formatDate(to)} (IST).`
        : `${Noun} gained since ${formatDate(from)}, per repository, to ${formatDate(to)} (IST).`
      : scale === "relative"
        ? `${Noun} per ${unit}${smoothing ? ", averaged over 7 days," : ""} as a percentage of each repository's total at the start of the ${unit}, ${span} (IST).`
        : `${Noun} per ${unit}${smoothing ? ", trailing 7-day average," : ""} for each repository, ${span} (IST).`;
  const formatValue = scale === "relative" ? formatPct : smoothing ? (v: number) => v.toFixed(1) : formatInt;
  const formatY = scale === "relative" ? formatPct : undefined;

  const viewOptions: { key: View; label: string }[] =
    group === "day"
      ? [
          { key: "per", label: "Per day" },
          { key: "avg7", label: "7-day avg" },
          { key: "cumulative", label: "Cumulative" },
        ]
      : [
          { key: "per", label: "Per month" },
          { key: "cumulative", label: "Cumulative" },
        ];

  return (
    <Card contentClassName="flex flex-1 flex-col" title={TITLES[group]} subtitle={subtitle}>
      <RangeControls state={rangeState} current={{ from, to }} />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Metric" value={metric} options={COMPARE_METRICS} onChange={setMetric} />
        <Segmented label="View" value={view} options={viewOptions} onChange={setView} />
        <Segmented
          label="Scale"
          value={scale}
          options={[
            { key: "count", label: "Count" },
            { key: "relative", label: "% of total", disabled: !relativeOk, title: relativeOk ? undefined : "Available for stars and forks" },
          ]}
          onChange={setScaleChoice}
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
                title={t.empty ? "No readings yet" : t.unknown ? `${t.unknown} ${unit}${t.unknown === 1 ? "" : "s"} in this range without a reading` : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                  on ? "bg-background text-foreground hover:bg-muted/60" : "border-dashed text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("inline-block h-0.5 w-3.5 shrink-0 rounded-sm", !on && "opacity-40")} style={{ background: on ? s.color : "var(--series-gray)" }} />
                <span className={cn(!on && "line-through decoration-muted-foreground/50")}>{s.label}</span>
                <span className={cn("font-mono font-medium tnum", !on && "opacity-60")}>{t.value === null ? "—" : scale === "relative" ? `+${formatPct(t.value)}` : formatInt(t.value)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto">
        {visible.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Pick a repository above to draw its line.</div>
        ) : (
          <TimeSeriesChart
            data={rows}
            series={visible}
            height={300}
            legend={false}
            partialLast={partialLast}
            formatX={formatX}
            formatXLong={formatXLong}
            formatY={formatY}
            formatValue={formatValue}
            decimals={scale === "relative" || smoothing}
          />
        )}
        <p className="mt-3 text-xs text-pretty text-muted-foreground">
          Click a repository to show or hide its line; its number is {scale === "relative" ? "its growth over the range against its total at the start" : "the total for the range"}.
          {smoothing && " Each point is the average of that day and the six before it."}
          {partialLast && ` The dashed end is the ${unit} still in progress.`}
          {gaps && ` A ${unit} without a reading is left out of a total and adds nothing to a cumulative line.`}
          {scaleChoice === "relative" && !relativeOk && " % of total is available for stars and forks; counts are shown meanwhile."}
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
