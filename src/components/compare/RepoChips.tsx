import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RemoveRepoButton } from "./RemoveRepoButton";

export interface RepoChip {
  id: number | null;
  full_name: string;
  color: string;
  href: string;
  primary: boolean;
  /** Something to say under the name, e.g. "no readings yet". */
  note?: string;
}

/** The repos on the page, each in its chart colour; the primary one cannot be removed. */
export function RepoChips({ repos }: { repos: RepoChip[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Repositories compared">
      {repos.map((r) => (
        <li key={r.full_name} className="inline-flex items-center gap-1.5 rounded-lg border bg-card py-1 pr-1 pl-2.5 text-sm shadow-xs">
          <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
          <Link href={r.href} prefetch={false} className="font-medium text-foreground underline-offset-2 hover:underline">
            {r.full_name}
          </Link>
          {r.primary ? (
            <Badge variant="secondary" className="mr-1 ml-0.5 text-[10px] uppercase">
              baseline
            </Badge>
          ) : (
            <>
              {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
              {r.id !== null && <RemoveRepoButton id={r.id} fullName={r.full_name} compact />}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
