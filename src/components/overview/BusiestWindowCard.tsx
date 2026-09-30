import { Card } from "@/components/Card";
import { HorizontalBars } from "@/components/HorizontalBars";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInt, pct } from "@/lib/format";
import { slotSeries } from "@/lib/queries";
import { sumBy } from "@/lib/stats";
import { addDays, SLOT_WINDOWS, SLOTS } from "@/lib/time";
import { PageLink } from "./PageLink";

const TITLE = "Busiest time of day";
const SUBTITLE = "New stars in the last 7 days, by 6-hour window (IST).";
const ORD = ["var(--ord-1)", "var(--ord-2)", "var(--ord-3)", "var(--ord-4)"];
const link = <PageLink href="/time-of-day?metric=stars&range=7d">Time of day</PageLink>;

/** The 6-hour window with the most new stars this week, over the same days as the Time of day page's "7 days". */
export async function BusiestWindowCard({ today }: { today: string }) {
  const points = await slotSeries(addDays(today, -6), today);
  const stars = SLOTS.map((slot) => sumBy(points.filter((p) => p.slot === slot), (p) => Number(p.new_stars ?? 0)));
  const total = stars.reduce((a, b) => a + b, 0);
  const busiest = stars.indexOf(Math.max(...stars));

  return (
    <Card title={TITLE} subtitle={SUBTITLE} action={link}>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">No new stars counted by window in the last 7 days.</p>
      ) : (
        <>
          <p className="font-heading text-2xl leading-tight font-semibold tracking-tight text-foreground">{SLOT_WINDOWS[SLOTS[busiest]]}</p>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">
            {pct(stars[busiest] / total)} of this week&apos;s {formatInt(total)} new stars
          </p>
          <HorizontalBars items={SLOTS.map((slot, i) => ({ label: SLOT_WINDOWS[slot], value: stars[i], color: ORD[i] }))} format={(v) => `${formatInt(v)} · ${pct(v / total)}`} />
        </>
      )}
    </Card>
  );
}

export function BusiestWindowCardSkeleton() {
  return (
    <Card title={TITLE} subtitle={SUBTITLE} action={link}>
      <Skeleton className="h-44" />
    </Card>
  );
}
