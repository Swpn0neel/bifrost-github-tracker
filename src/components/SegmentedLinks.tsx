import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SegmentedLinkItem {
  key: string;
  label: string;
  href: string;
}

interface SegmentedLinksProps {
  items: SegmentedLinkItem[];
  activeKey: string | null;
  label: string;
}

/** Tabs-style pill group where every option is a plain link, so the choice lives in the URL. */
export function SegmentedLinks({ items, activeKey, label }: SegmentedLinksProps) {
  return (
    <nav aria-label={label} className="inline-flex h-9 w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            // These pages hit the database; don't prefetch every option.
            prefetch={false}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-background text-foreground shadow-sm dark:bg-input/50" : "hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
