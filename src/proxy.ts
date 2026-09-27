import { NextResponse, type NextRequest } from "next/server";
import { collectSecretMatches, encodeHubUser, HUB_USER_HEADER, verifyHubSession, type HubUser } from "@/lib/auth";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/api/health"];
const UNAVAILABLE = "Sign-in service unavailable, try again shortly.";

/** Continue with the verified user in HUB_USER_HEADER; a value the browser sent under that name never gets through. */
function forward(req: NextRequest, user: HubUser | null): NextResponse {
  const headers = new Headers(req.headers);
  headers.delete(HUB_USER_HEADER);
  if (user) headers.set(HUB_USER_HEADER, encodeHubUser(user));
  return NextResponse.next({ request: { headers } });
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return forward(req, null);
  // External triggers of /api/refresh carry the bearer COLLECT_SECRET and must work while the hub is down.
  if (pathname === "/api/refresh" && collectSecretMatches(req.headers.get("authorization"))) return forward(req, null);

  const check = await verifyHubSession(req.headers.get("cookie"));
  if (check.status === "ok") return forward(req, check.user);

  // APIs and fetches get JSON; the frontend reloads on 401/403 so the page request below redirects.
  const wantsJson = pathname.startsWith("/api/") || (req.headers.get("accept") ?? "").includes("application/json");
  const noStore = { "Cache-Control": "no-store" };
  if (check.status === "unavailable") {
    return wantsJson
      ? NextResponse.json({ error: UNAVAILABLE }, { status: 503, headers: noStore })
      : new NextResponse(UNAVAILABLE, { status: 503, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (wantsJson) {
    const error = check.status === "forbidden" ? "forbidden" : "unauthenticated";
    return NextResponse.json({ error }, { status: check.status === "forbidden" ? 403 : 401, headers: noStore });
  }
  // `next` is built from APP_PUBLIC_URL, never from the Host header.
  const target =
    check.status === "forbidden"
      ? `${env.hubUrl}/no-access?app=${encodeURIComponent(env.hubAppSlug)}`
      : `${env.hubUrl}/login?next=${encodeURIComponent(env.appPublicUrl + pathname + search)}`;
  return NextResponse.redirect(target, { status: 302, headers: noStore });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
