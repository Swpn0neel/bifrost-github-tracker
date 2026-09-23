import { NextResponse, type NextRequest } from "next/server";
import { runSnapshotJob } from "@/collector/jobs";
import { collectSecretMatches, isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { runInProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual snapshot: the dashboard's Refresh button (cookie) or an external caller (bearer COLLECT_SECRET).
 * The reading counts like a scheduled one (see ON_TIME in queries.ts): today's close and the open 6-hour
 * window follow it, and it stands in for a missed run when taken in a window's first hour. Only a compared
 * repo's initial event load stays with the cron runs, since it can outlast this route's time limit.
 */
export async function POST(req: NextRequest) {
  const authorized =
    collectSecretMatches(req.headers.get("authorization")) || (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value));
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Don't pile onto a scheduled run (or another click) that is still fetching.
  if (await runInProgress()) {
    return NextResponse.json({ error: "A collector run is already in progress. Try again in a minute." }, { status: 409 });
  }

  const result = await runSnapshotJob("manual");
  return NextResponse.json({ ...result, log: result.log.slice(-40) }, { status: result.status === "error" ? 500 : 200 });
}
