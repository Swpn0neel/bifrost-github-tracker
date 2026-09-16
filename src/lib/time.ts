// IST is UTC+5:30 with no DST, so fixed-offset arithmetic is exact.
export const IST_OFFSET_MINUTES = 330;
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;

// The four daily collection windows, keyed by IST start hour.
export const SLOTS = [0, 6, 12, 18] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABELS: Record<Slot, string> = {
  0: "12 AM",
  6: "6 AM",
  12: "12 PM",
  18: "6 PM",
};
export const SLOT_WINDOWS: Record<Slot, string> = {
  0: "12 AM – 6 AM",
  6: "6 AM – 12 PM",
  12: "12 PM – 6 PM",
  18: "6 PM – 12 AM",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A Date whose UTC fields read as IST wall-clock time. */
function shifted(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

export function istDate(d: Date = new Date()): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function istHour(d: Date = new Date()): number {
  return shifted(d).getUTCHours();
}

export function istSlot(d: Date = new Date()): Slot {
  return (Math.floor(istHour(d) / 6) * 6) as Slot;
}

/** UTC instant of 00:00 IST on the given YYYY-MM-DD. */
export function istMidnightUtc(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);
}

export function slotStartUtc(date: string, slot: Slot): Date {
  return new Date(istMidnightUtc(date).getTime() + slot * 3_600_000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isIsoDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatIstDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const s = shifted(typeof value === "string" ? new Date(value) : value);
  let h = s.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(s.getUTCMinutes()).padStart(2, "0");
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}, ${h}:${mm} ${ampm} IST`;
}

export function formatRelative(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "never";
  const t = typeof value === "string" ? Date.parse(value) : value.getTime();
  const diff = Math.max(0, now.getTime() - t);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
