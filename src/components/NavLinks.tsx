"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/daily", label: "Daily" },
  { href: "/quarters", label: "Quarters" },
  { href: "/issues", label: "Issues & PRs" },
  { href: "/activity", label: "Activity" },
  { href: "/status", label: "Status" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded px-2.5 py-1 ${active ? "bg-ink text-page font-medium" : "text-ink-2 hover:bg-grid hover:text-ink"}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
