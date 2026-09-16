import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM snapshots");
    return NextResponse.json({ ok: true, snapshots: row?.n ?? 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
