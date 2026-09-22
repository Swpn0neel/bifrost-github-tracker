"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addDays, daysBetween, formatDate, isIsoDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// `days` is an inclusive day count ending today; "all" and "custom" have none.
export const PRESETS = [
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
export type PresetKey = (typeof PRESETS)[number]["key"];
type Preset = (typeof PRESETS)[number];

export interface DateSpan {
  from: string;
  to: string;
}

interface SegmentedProps<K extends string> {
  label: string;
  value: K;
  options: readonly { key: K; label: string }[];
  onChange: (key: K) => void;
}

export function Segmented<K extends string>({ label, value, options, onChange }: SegmentedProps<K>) {
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

export interface TrendRangeState {
  dataStart: string;
  today: string;
  preset: PresetKey;
  presetOptions: readonly Preset[];
  /** `current` is the range on screen, which "Custom" starts from. */
  pickPreset: (key: PresetKey, current: DateSpan) => void;
  custom: DateSpan;
  customValid: boolean;
  editCustom: (patch: Partial<DateSpan>) => void;
  /** The range to draw, clamped to the data. */
  range: DateSpan;
}

/**
 * Range state for a trend chart: a preset ending today, or a custom pair of dates.
 * A preset longer than the history is hidden (it would draw the same chart as "All"),
 * and the card opens on "All" when its default preset does not fit.
 */
export function useTrendRange(dataStart: string, today: string, defaultPreset: PresetKey, presets?: readonly PresetKey[]): TrendRangeState {
  const span = dataStart ? daysBetween(dataStart, today) + 1 : 0;
  const presetFits = (p: Preset) => p.days === null || p.days < span;
  const [preset, setPreset] = useState<PresetKey>(() => (PRESETS.some((p) => p.key === defaultPreset && presetFits(p)) ? defaultPreset : "all"));
  // `custom` is what the date inputs show; `applied` is the last valid pair, which is what gets drawn.
  const [custom, setCustom] = useState<DateSpan>({ from: "", to: "" });
  const [applied, setApplied] = useState<DateSpan | null>(null);

  const presetRange = (key: PresetKey): DateSpan => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p?.days) return { from: dataStart, to: today };
    const from = addDays(today, -(p.days - 1));
    return { from: from < dataStart ? dataStart : from, to: today };
  };
  const isValid = (c: DateSpan) => isIsoDate(c.from) && isIsoDate(c.to) && c.from <= c.to && c.to >= dataStart && c.from <= today;
  const range =
    preset === "custom" && applied ? { from: applied.from < dataStart ? dataStart : applied.from, to: applied.to > today ? today : applied.to } : presetRange(preset === "custom" ? "all" : preset);

  const pickPreset = (key: PresetKey, current: DateSpan) => {
    // Custom starts from whatever is on screen, so switching to it changes nothing until a date is edited.
    if (key === "custom" && preset !== "custom") {
      setCustom(current);
      setApplied(current);
    }
    setPreset(key);
  };
  const editCustom = (patch: Partial<DateSpan>) => {
    const next = { ...custom, ...patch };
    setCustom(next);
    if (isValid(next)) setApplied(next);
  };
  const presetOptions = PRESETS.filter((p) => p.key === preset || ((!presets || presets.includes(p.key)) && presetFits(p)));

  return { dataStart, today, preset, presetOptions, pickPreset, custom, customValid: isValid(custom), editCustom, range };
}

/** The preset pills, the custom date inputs, and the message when those are not a valid range. */
export function RangeControls({ state, current, children }: { state: TrendRangeState; current: DateSpan; children?: React.ReactNode }) {
  const { dataStart, today, preset, presetOptions, pickPreset, custom, customValid, editCustom } = state;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Time range" value={preset} options={presetOptions} onChange={(key) => pickPreset(key, current)} />
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
        {children}
      </div>
      {preset === "custom" && !customValid && (
        <p role="alert" className="mb-3 text-xs text-bad">
          Pick a start date on or before the end date, between {formatDate(dataStart)} and {formatDate(today)}. The chart keeps the last valid range until then.
        </p>
      )}
    </>
  );
}
