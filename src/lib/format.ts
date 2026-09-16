export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** 1,284 -> "1.3K", 12,900 -> "13K", 4,200,000 -> "4.2M". */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function signed(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "±0";
  const s = formatInt(Math.abs(n));
  return n > 0 ? `+${s}` : `−${s}`;
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function daysLabel(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n < 1) return `${Math.round(n * 24)} h`;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} d`;
}

export function fixed(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
