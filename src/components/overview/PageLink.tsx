import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** "Compare →" in a card's corner: a way into the page that has the full view. */
export function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-link underline-offset-2 hover:underline">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
