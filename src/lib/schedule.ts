import { addDays, istDate, istHour, SLOTS, slotStartUtc, type Slot } from "./time";

/** UTC instant of the next scheduled collector run (00/06/12/18 IST). */
export function nextRun(now: Date = new Date()): Date {
  const date = istDate(now);
  const hour = istHour(now);
  const next = SLOTS.find((s) => s > hour);
  return next === undefined ? slotStartUtc(addDays(date, 1), 0) : slotStartUtc(date, next);
}

/** UTC instant of the most recent scheduled run boundary. */
export function lastScheduledRun(now: Date = new Date()): Date {
  const date = istDate(now);
  const slot = (Math.floor(istHour(now) / 6) * 6) as Slot;
  return slotStartUtc(date, slot);
}
