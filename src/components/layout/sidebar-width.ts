export const SIDEBAR_WIDTH_COOKIE = "sidebar_width";
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 420;

export function clampSidebarWidth(px: number): number {
  return Math.round(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, px)));
}

/** Cookie value -> a safe pixel width (falls back to the default for anything odd). */
export function parseSidebarWidth(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_WIDTH_DEFAULT;
}
