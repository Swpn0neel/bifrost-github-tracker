import { env } from "./env";

/**
 * Sign-in happens on the GTM Hub. Its Better Auth session cookie is set on .agitracker.io, so it reaches this
 * app too; nothing here parses it. The proxy forwards it to the hub's verify endpoint and trusts the answer.
 */
export interface HubUser {
  email: string;
  name: string;
  role: string;
}

export type HubCheck =
  | { status: "ok"; user: HubUser }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "unavailable" };

/** Request header the proxy uses to hand the verified user to pages and route handlers. */
export const HUB_USER_HEADER = "x-hub-user";

const DEV_USER: HubUser = { email: "dev@localhost", name: "Local dev", role: "admin" };
const VERIFY_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 1_000;

// Positive answers only, keyed by a hash of the forwarded cookies, so a page load makes one hub call.
const cache = new Map<string, { user: HubUser; expires: number }>();

/**
 * The incoming cookies whose name contains "better-auth.", exactly as they arrived. Framework cookie parsers
 * URL-decode values, which breaks the signed session token, so this reads the raw header.
 */
function hubCookies(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.includes("=") && pair.slice(0, pair.indexOf("=")).includes("better-auth."))
    .join("; ");
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function remember(key: string, user: HubUser): void {
  const now = Date.now();
  for (const [k, entry] of cache) if (entry.expires <= now) cache.delete(k);
  // A Map iterates in insertion order, so this drops the oldest entries first.
  for (const k of cache.keys()) {
    if (cache.size < CACHE_MAX) break;
    cache.delete(k);
  }
  cache.set(key, { user, expires: now + CACHE_TTL_MS });
}

function toUser(value: unknown): HubUser | null {
  const user = value as { email?: unknown; name?: unknown; role?: unknown } | null;
  if (!user || typeof user.email !== "string" || !user.email) return null;
  return {
    email: user.email,
    name: typeof user.name === "string" ? user.name : user.email,
    role: typeof user.role === "string" ? user.role : "user",
  };
}

/** Ask the hub whether this request's session may use this app. Anything unexpected fails closed. */
export async function verifyHubSession(cookieHeader: string | null): Promise<HubCheck> {
  if (env.hubSsoDisabled) return { status: "ok", user: DEV_USER };
  const cookies = hubCookies(cookieHeader);
  if (!cookies) return { status: "unauthenticated" };

  const key = await sha256Hex(cookies);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { status: "ok", user: hit.user };

  const url = `${env.hubUrl}/api/sso/verify?app=${encodeURIComponent(env.hubAppSlug)}`;
  try {
    const res = await fetch(url, {
      headers: { Cookie: cookies, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: "unauthenticated" };
    if (res.status === 403) return { status: "forbidden" };
    if (res.status === 404) {
      console.error(`[auth] The hub does not know the app slug "${env.hubAppSlug}" (404 from ${url}). Register it in the hub or fix HUB_APP_SLUG.`);
      return { status: "unavailable" };
    }
    if (res.status !== 200) {
      console.error(`[auth] Hub verify answered HTTP ${res.status}; refusing the request.`);
      return { status: "unavailable" };
    }
    const user = toUser(((await res.json()) as { user?: unknown }).user);
    if (!user) {
      console.error("[auth] Hub verify answered 200 without a user; refusing the request.");
      return { status: "unavailable" };
    }
    remember(key, user);
    return { status: "ok", user };
  } catch (err) {
    console.error(`[auth] Hub verify failed (${err instanceof Error ? err.message : String(err)}); refusing the request.`);
    return { status: "unavailable" };
  }
}

/** Header value for the verified user: URI-encoded JSON, since header values must be ASCII and names need not be. */
export function encodeHubUser(user: HubUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

/** The user the proxy verified, or null. Trustworthy only because the proxy always replaces this header. */
export function readHubUser(headers: Headers): HubUser | null {
  const value = headers.get(HUB_USER_HEADER);
  if (!value) return null;
  try {
    return toUser(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function collectSecretMatches(authorization: string | null): boolean {
  const secret = env.collectSecret;
  if (!secret || !authorization) return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? timingSafeEqual(match[1], secret) : false;
}
