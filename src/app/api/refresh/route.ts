import { NextResponse, type NextRequest } from "next/server";
import { runSnapshotJob } from "@/collector/jobs";
import { collectSecretMatches, readHubUser } from "@/lib/auth";
import { runInProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual snapshot: the dashboard's Refresh button (hub user from the proxy) or an external caller (bearer COLLECT_SECRET).
 * The reading counts like a scheduled one (see ON_TIME in queries.ts): today's close and the open 6-hour
 * window follow it, and it stands in for a missed run when taken in a window's first hour. A compared
 * repo's initial event load is never part of it (it can outlast this route's time limit): it starts in the
 * background when the repo is added, and the cron runs finish any load that was cut short.
 */
export async function POST(req: NextRequest) {
  const authorized = collectSecretMatches(req.headers.get("authorization")) || readHubUser(req.headers) !== null;
  if (!authorized) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Don't pile onto a scheduled run (or another click) that is still fetching; a repo's event load running in the background is fine.
  if (await runInProgress()) {
    return NextResponse.json({ error: "A collector run is already in progress. Try again in a minute." }, { status: 409 });
  }

  const result = await runSnapshotJob("manual");
  return NextResponse.json({ ...result, log: result.log.slice(-40) }, { status: result.status === "error" ? 500 : 200 });
}
