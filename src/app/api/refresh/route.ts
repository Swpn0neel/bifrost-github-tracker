import { NextResponse, type NextRequest } from "next/server";
import { runSnapshotJob } from "@/collector/jobs";
import { collectSecretMatches, isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { runInProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual snapshot: the dashboard's Refresh button (cookie) or an external caller (bearer COLLECT_SECRET).
 * It refreshes the live numbers only; days and 6-hour windows use the scheduled cron runs (see SCHEDULED in queries.ts).
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
