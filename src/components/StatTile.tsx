import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatInt, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  /** Small decorative icon next to the label. */
  icon?: ReactNode;
}

export function StatTile({ label, value, valueText, delta, deltaLabel, upIsGood = null, trend, hero = false, hint, icon }: StatTileProps) {
  let deltaClass = "bg-muted text-muted-foreground";
  if (delta && upIsGood !== null) {
    const good = delta > 0 === upIsGood;
    deltaClass = good ? "bg-good/10 text-good" : "bg-bad/10 text-bad";
  }
  const TrendIcon = !delta ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <Card className={cn("gap-0 shadow-xs", hero && "bg-linear-to-br from-card to-muted/60")}>
      <div className="flex flex-1 flex-col px-4">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          <span className="text-pretty">{label}</span>
          {icon && <span className="shrink-0 text-muted-foreground/70 [&>svg]:size-3.5">{icon}</span>}
        </div>
        <div className={cn("mt-1.5 font-heading font-semibold tracking-tight text-foreground", hero ? "text-5xl leading-none" : "text-2xl leading-tight")}>
          {valueText ?? formatInt(value)}
        </div>
        {delta !== undefined && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="secondary" className={cn("rounded-md px-1.5 tnum", deltaClass)}>
              <TrendIcon aria-hidden />
              {signed(delta)}
            </Badge>
            {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
          </div>
        )}
        {hint && <div className="mt-1.5 text-xs text-pretty text-muted-foreground">{hint}</div>}
        {trend && trend.length > 1 && (
          <div className="mt-auto pt-3">
            <Sparkline values={trend} />
          </div>
        )}
      </div>
    </Card>
  );
}
