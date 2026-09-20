import { formatInt } from "@/lib/format";

export interface BarItem {
  label: string;
  value: number;
  href?: string;
  /** CSS color; defaults to series-1. */
  color?: string;
}

interface HorizontalBarsProps {
  items: BarItem[];
  format?: (v: number) => string;
  emptyText?: string;
}

/** Ranked bars with the value at the tip. One hue unless the caller passes ordinal steps. */
export function HorizontalBars({ items, format = formatInt, emptyText = "No data" }: HorizontalBarsProps) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs">
          <span className="truncate text-foreground" title={item.label}>
            {item.href ? (
              <a href={item.href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-link hover:underline">
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </span>
          <span className="h-3 w-full">
            <span
              className="block h-3 rounded-r-[4px]"
              style={{ width: `${Math.max(1, (item.value / max) * 100)}%`, background: item.color ?? "var(--series-1)" }}
              title={`${item.label}: ${format(item.value)}`}
            />
          </span>
          <span className="min-w-6 text-right font-medium text-muted-foreground tnum">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
