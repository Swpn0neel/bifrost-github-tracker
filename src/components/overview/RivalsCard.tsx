import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { starGains } from "@/lib/compare";
import { repoColor } from "@/lib/compare-ui";
import { env } from "@/lib/env";
import { signed, signedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageLink } from "./PageLink";

const TITLE = "Against compared repos";
const link = <PageLink href="/compare">Compare</PageLink>;

/** Stars gained in the last 7 days by this repo and each compared one, ranked; colours match the Compare page. */
export async function RivalsCard({ today }: { today: string }) {
  const rivals = (await starGains(today, 7))
    .map((g, i) => ({ ...g, color: repoColor(i) }))
    .filter((r): r is typeof r & { gain: number } => r.gain !== null)
    .sort((a, b) => b.gain - a.gain);
  const rank = rivals.findIndex((r) => r.primary) + 1;
  const maxGain = Math.max(1, ...rivals.map((r) => r.gain));

  return (
    <Card title={TITLE} subtitle={rank ? `Stars gained in the last 7 days; ${env.repo} is #${rank} of ${rivals.length}.` : "Stars gained in the last 7 days."} action={link}>
      {rivals.length < 2 ? (
        <p className="text-xs text-muted-foreground">Add repositories on the Compare page to see how this week stacks up.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {rivals.map((r) => (
              <li key={r.key} className={cn("grid grid-cols-[minmax(0,11rem)_1fr_auto_3.5rem] items-center gap-3 text-xs", r.primary && "font-semibold")}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                  <span className="truncate text-foreground" title={r.full_name}>
                    {r.full_name}
                  </span>
                </span>
                <span className="h-3 w-full">
                  <span className="block h-3 rounded-r-[4px]" style={{ width: `${Math.max(1, (Math.max(r.gain, 0) / maxGain) * 100)}%`, background: r.color }} />
                </span>
                <span className="text-right text-foreground tnum">{signed(r.gain)}</span>
                <span className="text-right font-normal text-muted-foreground tnum">{signedPct(r.growth, 1)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-pretty text-muted-foreground">The percentage is growth on each repository&apos;s own star count, so large and small ones compare fairly.</p>
        </>
      )}
    </Card>
  );
}

/** Holds the card's place while its numbers load. */
export function RivalsCardSkeleton() {
  return (
    <Card title={TITLE} subtitle="Stars gained in the last 7 days." action={link}>
      <Skeleton className="h-44" />
    </Card>
  );
}
