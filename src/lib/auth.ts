import { env } from "./env";

export const SESSION_COOKIE = "bgt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

// Web Crypto so this works in both the Node runtime and the proxy.
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The token is derived from the password, so rotating the password logs everyone out.
export async function sessionToken(): Promise<string> {
  return hmacHex(env.sessionSecret, `bifrost-github-tracker:session:v1:${env.dashboardPassword}`);
}

export async function isValidSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  return timingSafeEqual(token, await sessionToken());
}

export function passwordMatches(input: string): boolean {
  return timingSafeEqual(input, env.dashboardPassword);
}

export function collectSecretMatches(authorization: string | null): boolean {
  const secret = env.collectSecret;
  if (!secret || !authorization) return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? timingSafeEqual(match[1], secret) : false;
}
