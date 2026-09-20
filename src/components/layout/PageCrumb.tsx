"use client";

import { usePathname } from "next/navigation";
import { isActivePath, METRIC_LINKS, SYSTEM_LINKS } from "./nav-items";

/** "maximhq/bifrost / Daily" in the top bar; the page itself carries the h1. */
export function PageCrumb({ repo }: { repo: string }) {
  const pathname = usePathname();
  const current = [...METRIC_LINKS, ...SYSTEM_LINKS].find((l) => isActivePath(pathname, l.href));
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="hidden truncate text-muted-foreground sm:inline">{repo}</span>
      <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
        /
      </span>
      <span className="truncate font-medium text-foreground">{current?.label ?? "Dashboard"}</span>
    </div>
  );
}
