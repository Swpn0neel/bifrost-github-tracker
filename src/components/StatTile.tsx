import { formatInt, signed } from "@/lib/format";
import { Sparkline } from "./Sparkline";

interface StatTileProps {
  label: string;
  value: number | null | undefined;
  /** Pre-formatted value overrides `value`. */
  valueText?: string;
  delta?: number | null;
  deltaLabel?: string;
  /** true: up is good, false: up is bad, null/undefined: neutral. */
  upIsGood?: boolean | null;
  trend?: number[];
  hero?: boolean;
  hint?: string;
}

export function StatTile({ label, value, valueText, delta, deltaLabel, upIsGood = null, trend, hero = false, hint }: StatTileProps) {
  let deltaClass = "text-ink-2";
  if (delta && upIsGood !== null) {
    const good = delta > 0 === upIsGood;
    deltaClass = good ? "text-good" : "text-bad";
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 font-semibold text-ink ${hero ? "text-5xl leading-none" : "text-2xl leading-tight"}`}>
        {valueText ?? formatInt(value)}
      </div>
      {delta !== undefined && (
        <div className="mt-1 text-xs">
          <span className={`font-medium ${deltaClass}`}>{signed(delta)}</span>
          {deltaLabel && <span className="text-ink-2"> {deltaLabel}</span>}
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      {trend && trend.length > 1 && (
        <div className="mt-2">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}
