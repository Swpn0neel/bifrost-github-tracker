import { ArrowRight, CalendarRange } from "lucide-react";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RANGE_KEYS, RANGE_LABELS, type DateRange } from "@/lib/range";
import { formatDate } from "@/lib/time";
import { SegmentedLinks } from "./SegmentedLinks";

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <SegmentedLinks
        label="Date range"
        activeKey={range.key}
        items={RANGE_KEYS.map((key) => ({ key, label: RANGE_LABELS[key], href: withParams(basePath, { ...extra, range: key }) }))}
      />
      <Form action={basePath} prefetch={false} className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:flex sm:w-auto">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Input type="date" name="from" defaultValue={range.from} key={`from-${range.from}`} className="h-9 tnum sm:w-auto" aria-label="From" />
        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
        <Input type="date" name="to" defaultValue={range.to} key={`to-${range.to}`} className="h-9 tnum sm:w-auto" aria-label="To" />
        <Button type="submit" variant="outline" size="lg" className="col-span-3 sm:col-span-1">
          Apply
        </Button>
      </Form>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="size-3.5" aria-hidden />
        {formatDate(range.from)} – {formatDate(range.to)} · {range.days} days · IST
      </span>
    </div>
  );
}
