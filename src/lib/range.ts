import { addDays, daysBetween, isIsoDate, istDate } from "./time";

export const RANGE_KEYS = ["7d", "30d", "90d", "180d", "365d", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "180d": "6 months",
  "365d": "1 year",
  all: "All time",
};

export interface DateRange {
  key: RangeKey | "custom";
  from: string;
  to: string;
  days: number; // inclusive day count
}

export type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Resolve ?range=30d or ?from=YYYY-MM-DD&to=YYYY-MM-DD into concrete IST dates.
 * `dataStart` is the earliest date we have anything for (used by "all").
 */
export function resolveRange(sp: SearchParams, dataStart: string, defaultKey: RangeKey = "30d"): DateRange {
  const today = istDate();
  const from = first(sp.from);
  const to = first(sp.to);
  if (isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { key: "custom", from, to: to > today ? today : to, days: daysBetween(from, to) + 1 };
  }
  const raw = first(sp.range);
  const key: RangeKey = (RANGE_KEYS as readonly string[]).includes(raw ?? "") ? (raw as RangeKey) : defaultKey;
  if (key === "all") {
    const start = dataStart < today ? dataStart : today;
    return { key, from: start, to: today, days: daysBetween(start, today) + 1 };
  }
  const n = Number(key.slice(0, -1));
  const start = addDays(today, -(n - 1));
  return { key, from: start, to: today, days: n };
}

/** Same-length window immediately before `range`, for period-over-period comparisons. */
export function previousRange(range: DateRange): DateRange {
  const to = addDays(range.from, -1);
  const from = addDays(to, -(range.days - 1));
  return { key: "custom", from, to, days: range.days };
}

export function rangeQuery(range: DateRange): string {
  return range.key === "custom" ? `from=${range.from}&to=${range.to}` : `range=${range.key}`;
}
