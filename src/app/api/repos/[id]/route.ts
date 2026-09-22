import { NextResponse } from "next/server";
import { removeTrackedRepo } from "@/lib/compare";

export const dynamic = "force-dynamic";

/** Take a repository off the Compare page. Its readings are kept, so adding it again restores the history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const repo = await removeTrackedRepo(Number(id));
  if (!repo) return NextResponse.json({ error: "That repository is not on the Compare page." }, { status: 404 });
  return NextResponse.json({ repo: { id: repo.id, full_name: repo.full_name } });
}
