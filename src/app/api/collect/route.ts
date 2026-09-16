import { NextResponse, type NextRequest } from "next/server";
import { runSnapshotJob } from "@/collector/jobs";
import { collectSecretMatches, isValidSession, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual snapshot: the dashboard's Refresh button (cookie) or an external caller (bearer COLLECT_SECRET). */
export async function POST(req: NextRequest) {
  const authorized =
    collectSecretMatches(req.headers.get("authorization")) || (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value));
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await runSnapshotJob("manual");
  return NextResponse.json({ ...result, log: result.log.slice(-40) }, { status: result.status === "error" ? 500 : 200 });
}
