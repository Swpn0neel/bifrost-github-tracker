import { NextResponse, type NextRequest } from "next/server";
import { fetchRepo, parseRepoInput, RepoNotFoundError, storeRepoSnapshot } from "@/collector/repos";
import { upsertTrackedRepo } from "@/lib/compare";
import { env } from "@/lib/env";
import { GitHubClient } from "@/lib/github";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Add a repository to the Compare page (session cookie; the proxy rejects anything else). It gets its first reading right away. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { repo?: unknown };
  const parsed = parseRepoInput(typeof body.repo === "string" ? body.repo : "");
  if (!parsed) return NextResponse.json({ error: "Enter a repository as owner/name or paste its GitHub URL." }, { status: 400 });
  if (parsed.toLowerCase() === env.repo.toLowerCase()) {
    return NextResponse.json({ error: `${env.repo} is the repository the others are compared against; it is always on the page.` }, { status: 400 });
  }
  if (!env.githubToken) return NextResponse.json({ error: "GITHUB_TOKEN is not set; compared repositories need it for their counts." }, { status: 503 });

  const log = (msg: string) => console.log(`[repos] ${msg}`);
  const gh = new GitHubClient({ token: env.githubToken, repo: parsed, log });
  try {
    const { facts, counts } = await fetchRepo(gh, log);
    if (facts.full_name.toLowerCase() === env.repo.toLowerCase()) {
      return NextResponse.json({ error: `${parsed} redirects to ${env.repo}, which is always on the page.` }, { status: 400 });
    }
    const { repo, created } = await upsertTrackedRepo(facts.full_name);
    const snapshot = await storeRepoSnapshot(repo.id, facts, counts, "manual");
    return NextResponse.json({ repo: { id: repo.id, full_name: facts.full_name }, created, counts, snapshot: { id: snapshot.id, captured_at: snapshot.captured_at } });
  } catch (err) {
    if (err instanceof RepoNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    const message = err instanceof Error ? err.message : String(err);
    log(`add ${parsed} failed: ${message}`);
    return NextResponse.json({ error: `GitHub lookup failed: ${message}` }, { status: 502 });
  }
}
