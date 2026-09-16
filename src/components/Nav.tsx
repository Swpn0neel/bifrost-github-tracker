import Link from "next/link";
import { env } from "@/lib/env";
import { latestSnapshot } from "@/lib/queries";
import { nextRun } from "@/lib/schedule";
import { formatIstDateTime, formatRelative } from "@/lib/time";
import { NavLinks } from "./NavLinks";
import { RefreshButton } from "./RefreshButton";

export async function Nav() {
  const latest = await latestSnapshot();
  const next = nextRun();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/" className="text-sm font-semibold text-ink">
            Bifrost · GitHub tracker
            <span className="ml-2 font-normal text-ink-2">{env.repo}</span>
          </Link>
          <NavLinks />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
          <span title={latest ? formatIstDateTime(latest.captured_at) : "No snapshot yet"}>
            Updated {latest ? formatRelative(latest.captured_at) : "never"} · next {formatIstDateTime(next).replace(/^.*?, /, "")}
          </span>
          <RefreshButton />
          <form action="/api/logout" method="post">
            <button type="submit" className="text-ink-2 hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
