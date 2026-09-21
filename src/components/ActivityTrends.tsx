"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/Card";
import { TimeSeriesChart, type ChartSeries } from "@/components/TimeSeriesChart";
import { Input } from "@/components/ui/input";
import { formatInt } from "@/lib/format";
import { addDays, daysBetween, formatDate, formatMonth, formatShortDate, isIsoDate } from "@/lib/time";
import { periodEnd, trendWindow, type TrendGroup, type TrendMetric, type TrendRow } from "@/lib/trends";
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

// `days` is an inclusive day count ending today; "all" and "custom" have none.
const PRESETS = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "60d", label: "60D", days: 60 },
  { key: "90d", label: "90D", days: 90 },
  { key: "6m", label: "6M", days: 183 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "2y", label: "2Y", days: 730 },
  { key: "all", label: "All", days: null },
  { key: "custom", label: "Custom", days: null },
] as const;
type PresetKey = (typeof PRESETS)[number]["key"];

const TITLES: Record<TrendGroup, string> = { day: "Daily activity", week: "Weekly activity", month: "Monthly activity" };

interface SegmentedProps<K extends string> {
  label: string;
  value: K;
  options: readonly { key: K; label: string }[];
  onChange: (key: K) => void;
}

function Segmented<K extends string>({ label, value, options, onChange }: SegmentedProps<K>) {
  return (
    <div role="group" aria-label={label} className="inline-flex min-h-8 max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex h-[26px] items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === o.key ? "bg-background text-foreground shadow-sm dark:bg-input/50" : "hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface ActivityTrendsProps {
  /** One row per IST day, oldest first, with no gaps, ending today. */
  days: TrendRow[];
  /** Star gains per month ("YYYY-MM") for months whose days are not all known. */
  monthlyStars?: Record<string, number>;
  /** Caveat about where the star numbers come from. */
  starsNote?: ReactNode;
  /** What one point on the chart covers. Fixed per card: a daily chart stays daily whatever the range. */
  group: TrendGroup;
  /** Range the card opens on; falls back to "all" when the history is shorter than it. */
  defaultPreset?: PresetKey;
  /** Range options to offer, for a card meant for long or short views. Defaults to all of them. */
  presets?: readonly PresetKey[];
}

export function ActivityTrends({ days, monthlyStars, starsNote, group, defaultPreset = "60d", presets }: ActivityTrendsProps) {
  const dataStart = days[0]?.date ?? "";
  const today = days[days.length - 1]?.date ?? "";

  const span = dataStart ? daysBetween(dataStart, today) + 1 : 0;
  // A preset longer than the history would draw the same chart as "All".
  const presetFits = (p: (typeof PRESETS)[number]) => p.days === null || p.days < span;
  const [preset, setPreset] = useState<PresetKey>(() => (PRESETS.some((p) => p.key === defaultPreset && presetFits(p)) ? defaultPreset : "all"));
  // `custom` is what the date inputs show; `applied` is the last valid pair, which is what gets drawn.
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<TrendMetric>>(() => new Set(METRICS.filter((m) => !m.defaultOn).map((m) => m.key)));

  const presetRange = (key: PresetKey): { from: string; to: string } => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p?.days) return { from: dataStart, to: today };
    const from = addDays(today, -(p.days - 1));
    return { from: from < dataStart ? dataStart : from, to: today };
  };

  const isValid = (c: { from: string; to: string }) => isIsoDate(c.from) && isIsoDate(c.to) && c.from <= c.to && c.to >= dataStart && c.from <= today;
  const customValid = isValid(custom);
  const range =
    preset === "custom" && applied ? { from: applied.from < dataStart ? dataStart : applied.from, to: applied.to > today ? today : applied.to } : presetRange(preset === "custom" ? "all" : preset);

  const { rows, from, to } = trendWindow(days, range.from, range.to, group, monthlyStars);
  const last = rows[rows.length - 1];
  const partialLast = last !== undefined && periodEnd(last.date, group) >= today;

  const pickPreset = (key: PresetKey) => {
    // Custom starts from whatever is on screen, so switching to it changes nothing until a date is edited.
    if (key === "custom" && preset !== "custom") {
      setCustom({ from, to });
      setApplied({ from, to });
    }
    setPreset(key);
  };

  const editCustom = (patch: Partial<{ from: string; to: string }>) => {
    const next = { ...custom, ...patch };
    setCustom(next);
    if (isValid(next)) setApplied(next);
  };

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
  const presetOptions = PRESETS.filter((p) => p.key === preset || ((!presets || presets.includes(p.key)) && presetFits(p)));

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
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Time range" value={preset} options={presetOptions} onChange={pickPreset} />
        {preset === "custom" && (
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:flex sm:w-auto">
            <Input
              type="date"
              aria-label="From"
              aria-invalid={!customValid}
              value={custom.from}
              min={dataStart}
              max={today}
              onChange={(e) => editCustom({ from: e.target.value })}
              className="h-8 tnum sm:w-auto"
            />
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
            <Input
              type="date"
              aria-label="To"
              aria-invalid={!customValid}
              value={custom.to}
              min={dataStart}
              max={today}
              onChange={(e) => editCustom({ to: e.target.value })}
              className="h-8 tnum sm:w-auto"
            />
          </div>
        )}
      </div>
      {preset === "custom" && !customValid && (
        <p role="alert" className="mb-3 text-xs text-bad">
          Pick a start date on or before the end date, between {formatDate(dataStart)} and {formatDate(today)}. The chart keeps the last valid range until then.
        </p>
      )}

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
