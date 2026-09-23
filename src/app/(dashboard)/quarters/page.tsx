import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Heatmap } from "@/components/Heatmap";
import { Hint } from "@/components/Hint";
import { PageHeader } from "@/components/PageHeader";
import { RangeFilter } from "@/components/RangeFilter";
import { SegmentedLinks } from "@/components/SegmentedLinks";
import { StatTile } from "@/components/StatTile";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { fixed, formatInt, pct, signed } from "@/lib/format";
import { dataStartDate, hasStarEvents, slotSeries, slotWeekdayCounts, type HeatmapMetric, type SlotPoint } from "@/lib/queries";
import { resolveRange, type SearchParams } from "@/lib/range";
import { addDays, formatDate, formatIstDateTime, SLOT_LABELS, SLOT_WINDOWS, SLOTS, WEEKDAY_LABELS, weekday, type Slot } from "@/lib/time";

export const dynamic = "force-dynamic";

const METRICS: Record<HeatmapMetric, { key: keyof SlotPoint; label: string; netKey?: keyof SlotPoint; atKey?: keyof SlotPoint }> = {
  stars: { key: "new_stars", label: "New stars", netKey: "net_stars", atKey: "stars_at" },
  forks: { key: "new_forks", label: "New forks", netKey: "net_forks", atKey: "forks_at" },
  issues: { key: "issues_opened", label: "Issues opened", atKey: "open_issues_at" },
  prs: { key: "prs_opened", label: "PRs opened", atKey: "open_prs_at" },
  commits: { key: "commits", label: "Commits" },
};

const ORD = ["var(--ord-1)", "var(--ord-2)", "var(--ord-3)", "var(--ord-4)"];
const STAR_NOTE_SHORT = "GitHub does not expose the stargazer list to this token";
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function pickMetric(v: string | string[] | undefined): HeatmapMetric {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s in METRICS ? (s as HeatmapMetric) : "stars";
}

export default async function QuartersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const metric = pickMetric(sp.metric);
  const m = METRICS[metric];
  const dataStart = await dataStartDate();
  const range = resolveRange(sp, dataStart, "30d");
  const [points, heat, starEvents] = await Promise.all([slotSeries(range.from, range.to), slotWeekdayCounts(range.from, range.to, metric), hasStarEvents()]);
  const starsFromSnapshots = metric === "stars" && !starEvents;

  const value = (p: SlotPoint) => Number(p[m.key] ?? 0);

  // Per-day rows with one column per window, for the stacked chart and the table.
  const byDate = new Map<string, SlotPoint[]>();
  for (const p of points) {
    const list = byDate.get(p.date) ?? [];
    list.push(p);
    byDate.set(p.date, list);
  }
  const chartRows = [...byDate.entries()].map(([date, list]) => {
    const row: Record<string, string | number | null> = { date };
    for (const p of list) row[`s${p.slot}`] = value(p);
    return row;
  });

  const slotTotals = SLOTS.map((slot) => points.filter((p) => p.slot === slot).reduce((acc, p) => acc + value(p), 0));
  const grandTotal = slotTotals.reduce((a, b) => a + b, 0);
  const bestSlot = slotTotals.indexOf(Math.max(...slotTotals));

  // Heatmap: average per occurrence of each weekday in the range.
  const occurrences = new Array<number>(7).fill(0);
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) occurrences[weekday(d)]++;
  const heatIndex = new Map(heat.map((h) => [`${h.dow}:${h.slot}`, h.n]));
  if (starsFromSnapshots) {
    // No star events: aggregate the net change between consecutive snapshots instead.
    heatIndex.clear();
    for (const p of points) {
      if (p.net_stars === null || p.net_stars <= 0) continue;
      const key = `${weekday(p.date)}:${p.slot}`;
      heatIndex.set(key, (heatIndex.get(key) ?? 0) + p.net_stars);
    }
  }
  const heatValues = WEEKDAY_ORDER.map((dow) =>
    SLOTS.map((slot) => (occurrences[dow] ? (heatIndex.get(`${dow}:${slot}`) ?? 0) / occurrences[dow] : null)),
  );

  type DayRow = [string, SlotPoint[]];
  const tableRows: DayRow[] = [...byDate.entries()].reverse().slice(0, 21);
  const tableColumns: Column<DayRow>[] = [
    { key: "date", label: "Date", className: "whitespace-nowrap", render: ([date]) => formatDate(date) },
    ...SLOTS.map(
      (slot): Column<DayRow> => ({
        key: `s${slot}`,
        label: SLOT_LABELS[slot],
        align: "right",
        render: ([, list]) => {
          const p = list.find((x) => x.slot === (slot as Slot));
          if (!p) return "—";
          const net = m.netKey ? (p[m.netKey] as number | null) : null;
          const at = m.atKey ? (p[m.atKey] as number | null) : null;
          const untilNote = net !== null && p.net_partial && p.net_until ? ` · net change up to ${formatIstDateTime(p.net_until)}` : "";
          const title = p.captured_at
            ? `Reading ${formatIstDateTime(p.captured_at)}${at !== null ? ` · ${formatInt(at)} at window start` : ""}${untilNote}`
            : "No reading in the first hour of this window";
          return (
            <Hint text={title}>
              <span>
                {formatInt(value(p))}
                {net !== null && (
                  <span className="ml-1 text-muted-foreground">
                    [{signed(net)}
                    {p.net_partial ? " so far" : ""}]
                  </span>
                )}
              </span>
            </Hint>
          );
        },
      }),
    ),
    { key: "total", label: "Day", align: "right", render: ([, list]) => <span className="font-medium">{formatInt(list.reduce((acc, p) => acc + value(p), 0))}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quarters"
        description={
          <>
            Each day split into the four collector windows (IST). Bars count events with a timestamp inside the window. The brackets in the table are
            the net change between the readings at the start of consecutive windows; a window with no following reading yet shows the change up to its
            latest reading (so far), which a refresh updates.
            {starsFromSnapshots && ` For stars, gains are the net change between snapshots: ${STAR_NOTE_SHORT}.`}
          </>
        }
      />
      <div className="space-y-3">
        <SegmentedLinks
          label="Metric"
          activeKey={metric}
          items={(Object.keys(METRICS) as HeatmapMetric[]).map((k) => ({
            key: k,
            label: METRICS[k].label,
            href: `/quarters?metric=${k}&${range.key === "custom" ? `from=${range.from}&to=${range.to}` : `range=${range.key}`}`,
          }))}
        />
        <RangeFilter range={range} basePath="/quarters" extra={{ metric }} />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {SLOTS.map((slot, i) => (
          <StatTile
            key={slot}
            label={`${SLOT_WINDOWS[slot]}`}
            icon={<span className="block size-2.5 rounded-[3px]" style={{ background: ORD[i] }} />}
            value={slotTotals[i]}
            hint={`${pct(grandTotal ? slotTotals[i] / grandTotal : null)} of ${m.label.toLowerCase()} · ${fixed(slotTotals[i] / range.days)} per day${i === bestSlot && grandTotal ? " · busiest" : ""}`}
          />
        ))}
      </div>

      <Card title={`${m.label} by window`} subtitle="Stacked per day; lighter is earlier in the day">
        <TimeSeriesChart
          data={chartRows}
          height={280}
          series={SLOTS.map((slot, i) => ({ key: `s${slot}`, label: SLOT_WINDOWS[slot], color: ORD[i], type: "bar" as const, stackId: "day" }))}
        />
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card title="When does it happen?" subtitle={`Average ${m.label.toLowerCase()} per window, by weekday (IST)`}>
          <Heatmap
            rowLabels={WEEKDAY_ORDER.map((d) => WEEKDAY_LABELS[d])}
            colLabels={SLOTS.map((s) => SLOT_LABELS[s])}
            values={heatValues}
            format={(v) => fixed(v, 1)}
            caption={`Average ${m.label} per window by weekday`}
          />
          <p className="mt-3 text-xs text-pretty text-muted-foreground">Column labels are window start times; 6 PM covers 6 PM – midnight (US working hours).</p>
        </Card>
        <Card title="Recent days" subtitle="Gross events per window; net change between readings in brackets (so far: the window has no following reading yet)">
          <DataTable rows={tableRows} rowKey={([date]) => date} dense columns={tableColumns} />
        </Card>
      </div>
    </div>
  );
}
