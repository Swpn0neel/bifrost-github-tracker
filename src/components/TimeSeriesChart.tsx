"use client";

import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, formatInt } from "@/lib/format";
import { formatDate, formatShortDate } from "@/lib/time";

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
  formatX?: (v: string) => string;
  formatXLong?: (v: string) => string;
  formatY?: (v: number) => string;
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string | null }>;
  series: ChartSeries[];
  formatXLong: (v: string) => string;
  formatValue: (v: number) => string;
}

function ChartTooltip({ active, label, payload, series, formatXLong, formatValue }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value]));
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-ink">{formatXLong(String(label ?? ""))}</div>
      {series.map((s) => {
        const raw = byKey.get(s.key);
        const value = typeof raw === "number" ? formatValue(raw) : "—";
        return (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-0.5 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="font-semibold text-ink tnum">{value}</span>
            <span className="text-ink-2">{s.label}</span>
          </div>
        );
      })}
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
  formatXLong = formatDate,
  formatY = defaultFormatY,
}: TimeSeriesChartProps) {
  const hasBars = series.some((s) => s.type === "bar");
  const lastInStack = new Map<string, string>();
  for (const s of series) if (s.stackId) lastInStack.set(s.stackId, s.key);
  const domain: [number | string, number | string] = zeroBased ? [0, "auto"] : ["auto", "auto"];
  const roundedEnd: [number, number, number, number] = [4, 4, 0, 0];

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey={xKey}
              tickFormatter={(v) => formatX(String(v))}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--axis)" }}
              tickLine={false}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatY(Number(v))}
              width={48}
              domain={domain}
              allowDecimals={false}
            />
            <Tooltip
              cursor={hasBars ? { fill: "var(--grid)", fillOpacity: 0.5 } : { stroke: "var(--axis)", strokeWidth: 1 }}
              content={<ChartTooltip series={series} formatXLong={formatXLong} formatValue={formatInt} />}
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
                    stroke={s.stackId ? "var(--surface-1)" : undefined}
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
                    fill={s.color}
                    fillOpacity={0.1}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
                    isAnimationActive={false}
                    connectNulls
                  />
                );
              }
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              {s.type === "line" || s.type === undefined ? (
                <span className="inline-block h-0.5 w-3.5 rounded-sm" style={{ background: s.color }} />
              ) : (
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              )}
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
