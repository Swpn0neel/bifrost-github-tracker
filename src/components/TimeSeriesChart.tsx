"use client";

import { useId } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { CHART_RESIZE_SETTLE_MS, STRETCH_WHILE_RESIZING } from "./chart-resize";
import { compact, formatInt } from "@/lib/format";
import { formatDateWithDay, formatShortDate } from "@/lib/time";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type?: "line" | "bar" | "area";
  stackId?: string;
}

interface TimeSeriesChartProps {
  /** Plain rows; each series key must be a number (or null for a gap). */
  data: object[];
  series: ChartSeries[];
  height?: number;
  /** Bars must start at zero; trend lines may not. */
  zeroBased?: boolean;
  xKey?: string;
  /** Axis tick; a short date by default. */
  formatX?: (v: string) => string;
  /** Tooltip heading; the full date with its weekday by default. */
  formatXLong?: (v: string) => string;
  formatY?: (v: number) => string;
  /** How a value reads in the tooltip; whole numbers by default. */
  formatValue?: (v: number) => string;
  /** Let the y-axis tick at fractions, for rates and percentages. */
  decimals?: boolean;
  /** Set to false when the caller renders its own legend. */
  legend?: boolean;
  /** The last row is a period still in progress: lines reach it with a dashed segment. */
  partialLast?: boolean;
}

// A line's in-progress tail is plotted as a second, dashed line under this key.
const tailKey = (key: string) => `${key}__tail`;
const isNumber = (row: object, key: string) => typeof (row as Record<string, unknown>)[key] === "number";

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string | null }>;
  series: ChartSeries[];
  formatXLong: (v: string) => string;
  formatValue: (v: number) => string;
}

function Swatch({ series }: { series: ChartSeries }) {
  const isLine = series.type === "line" || series.type === undefined;
  return <span className={isLine ? "inline-block h-0.5 w-3.5 shrink-0 rounded-sm" : "inline-block size-2.5 shrink-0 rounded-[2px]"} style={{ background: series.color }} />;
}

function ChartTooltipBody({ active, label, payload, series, formatXLong, formatValue }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value]));
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{formatXLong(String(label ?? ""))}</div>
      <div className="grid gap-1.5">
        {series.map((s) => {
          const raw = byKey.get(s.key) ?? byKey.get(tailKey(s.key));
          const value = typeof raw === "number" ? formatValue(raw) : "—";
          return (
            <div key={s.key} className="flex items-center gap-2 leading-none">
              <Swatch series={s} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto pl-3 font-mono font-medium text-foreground tnum">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact only once ticks would get long; a narrow domain like 8,080–8,090 must stay readable.
const defaultFormatY = (v: number) => (Math.abs(v) >= 10_000 ? compact(v) : formatInt(v));

export function TimeSeriesChart({
  data,
  series,
  height = 240,
  zeroBased = true,
  xKey = "date",
  formatX = formatShortDate,
  formatXLong = formatDateWithDay,
  formatY = defaultFormatY,
  formatValue = formatInt,
  decimals = false,
  legend = true,
  partialLast = false,
}: TimeSeriesChartProps) {
  const gradientPrefix = `area-${useId().replace(/:/g, "")}`;
  const hasBars = series.some((s) => s.type === "bar");
  const lastInStack = new Map<string, string>();
  for (const s of series) if (s.stackId) lastInStack.set(s.stackId, s.key);
  const domain: [number | string, number | string] = zeroBased ? [0, "auto"] : ["auto", "auto"];
  const roundedEnd: [number, number, number, number] = [4, 4, 0, 0];

  // Split each line at the second-to-last row: solid up to it, dashed from it to the last one.
  const lineKeys = series.filter((s) => (s.type ?? "line") === "line").map((s) => s.key);
  const splitTail = partialLast && data.length >= 2 && lineKeys.length > 0;
  const plotData = splitTail
    ? data.map((row, i) => {
        const out: Record<string, unknown> = { ...row };
        for (const key of lineKeys) {
          const value = out[key];
          out[tailKey(key)] = i >= data.length - 2 ? value : null;
          if (i === data.length - 1) out[key] = null;
        }
        return out;
      })
    : data;
  // A line needs two points; a run with a single known value would otherwise draw nothing.
  const loneDot = (key: string, color: string) =>
    plotData.filter((row) => isNumber(row, key)).length === 1 ? { r: 4, fill: color, stroke: "var(--card)", strokeWidth: 2 } : false;

  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 600, height }} debounce={CHART_RESIZE_SETTLE_MS}>
        <ComposedChart data={plotData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={2} {...STRETCH_WHILE_RESIZING}>
          <defs>
            {series
              .filter((s) => s.type === "area")
              .map((s) => (
                <linearGradient key={s.key} id={`${gradientPrefix}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => formatX(String(v))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            tickMargin={6}
            minTickGap={28}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatY(Number(v))}
            width={48}
            domain={domain}
            allowDecimals={decimals}
          />
          <ChartTooltip
            cursor={hasBars ? { fill: "var(--muted)", fillOpacity: 0.7 } : { stroke: "var(--axis)", strokeWidth: 1 }}
            content={<ChartTooltipBody series={series} formatXLong={formatXLong} formatValue={formatValue} />}
            isAnimationActive={false}
          />
          {series.map((s) => {
            const type = s.type ?? "line";
            if (type === "bar") {
              const rounded = !s.stackId || lastInStack.get(s.stackId) === s.key;
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  stackId={s.stackId}
                  maxBarSize={24}
                  radius={rounded ? roundedEnd : 0}
                  stroke={s.stackId ? "var(--card)" : undefined}
                  strokeWidth={s.stackId ? 1 : 0}
                  isAnimationActive={false}
                />
              );
            }
            if (type === "area") {
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${gradientPrefix}-${s.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            }
            return [
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={loneDot(s.key, s.color)}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
                connectNulls
              />,
              splitTail && (
                <Line
                  key={tailKey(s.key)}
                  type="linear"
                  dataKey={tailKey(s.key)}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={loneDot(tailKey(s.key), s.color)}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                  connectNulls
                  legendType="none"
                />
              ),
            ];
          })}
        </ComposedChart>
      </ChartContainer>
      {legend && series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <Swatch series={s} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
