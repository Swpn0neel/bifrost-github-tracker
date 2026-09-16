interface HeatmapProps {
  rowLabels: string[];
  colLabels: string[];
  /** values[row][col]; null renders as empty. */
  values: (number | null)[][];
  format: (v: number) => string;
  caption?: string;
}

function step(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.min(7, Math.ceil((value / max) * 7)));
}

/** Sequential one-hue grid. Every cell shows its value, so color never carries it alone. */
export function Heatmap({ rowLabels, colLabels, values, format, caption }: HeatmapProps) {
  const max = Math.max(0, ...values.flat().map((v) => v ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th className="w-12" />
            {colLabels.map((c) => (
              <th key={c} className="pb-1 text-center font-medium text-ink-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, i) => (
            <tr key={r}>
              <th className="pr-2 text-right font-medium text-ink-2">{r}</th>
              {colLabels.map((c, j) => {
                const v = values[i]?.[j] ?? null;
                return (
                  <td
                    key={c}
                    className={`h-9 rounded-sm text-center tnum ${v === null ? "heat-0" : `heat-${step(v, max)}`}`}
                    title={v === null ? `${r} ${c}: no data` : `${r} ${c}: ${format(v)}`}
                  >
                    {v === null ? "" : format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
