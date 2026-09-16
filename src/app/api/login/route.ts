import { NextResponse, type NextRequest } from "next/server";
import { passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";
import { absoluteUrl, safeNextPath } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));

  if (!passwordMatches(password)) {
    const url = absoluteUrl(req, "/login");
    url.searchParams.set("error", "1");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(absoluteUrl(req, next), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
