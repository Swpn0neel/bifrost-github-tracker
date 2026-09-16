import { RANGE_KEYS, RANGE_LABELS, type DateRange } from "@/lib/range";
import { formatDate } from "@/lib/time";

interface RangeFilterProps {
  range: DateRange;
  basePath: string;
  /** Extra query params to preserve (e.g. metric). */
  extra?: Record<string, string>;
}

function withParams(basePath: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** One filter row above the charts; scopes everything below it. */
export function RangeFilter({ range, basePath, extra = {} }: RangeFilterProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <div className="flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1">
        {RANGE_KEYS.map((key) => {
          const active = range.key === key;
          return (
            <a
              key={key}
              href={withParams(basePath, { ...extra, range: key })}
              className={`rounded px-2.5 py-1 ${active ? "bg-ink text-page font-semibold" : "text-ink-2 hover:bg-grid"}`}
              aria-current={active ? "true" : undefined}
            >
              {RANGE_LABELS[key]}
            </a>
          );
        })}
      </div>
      <form action={basePath} method="get" className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-surface p-1">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="date" name="from" defaultValue={range.from} className="rounded bg-transparent px-1.5 py-0.5 text-ink" aria-label="From" />
        <span className="text-muted">→</span>
        <input type="date" name="to" defaultValue={range.to} className="rounded bg-transparent px-1.5 py-0.5 text-ink" aria-label="To" />
        <button type="submit" className="rounded px-2.5 py-1 text-ink-2 hover:bg-grid">
          Apply
        </button>
      </form>
      <span className="text-ink-2">
        {formatDate(range.from)} – {formatDate(range.to)} · {range.days} days · IST
      </span>
    </div>
  );
}
