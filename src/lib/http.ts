import type { NextRequest } from "next/server";

/** Absolute URL for redirects that respects Railway's forwarded proto/host. */
export function absoluteUrl(req: NextRequest, path: string): URL {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return new URL(path, `${proto}://${host}`);
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) return "/";
  return value;
}
