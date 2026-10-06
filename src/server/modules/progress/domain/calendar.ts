/**
 * Calendar dates as `YYYY-MM-DD` strings. Study days are the student's own
 * days, in their time zone; once a date is a string, arithmetic on it is
 * plain calendar arithmetic with no time zone involved.
 */

export type DateKey = string;

/** The calendar date at `at` in the zone, as `YYYY-MM-DD`. */
export function dateKey(at: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function fromUtc(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

/** The date `days` after `key` (before it, if negative). */
export function addDays(key: DateKey, days: number): DateKey {
  const date = toUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Day of the week, Monday 0 to Sunday 6. */
export function weekday(key: DateKey): number {
  return (toUtc(key).getUTCDay() + 6) % 7;
}

/** The Monday on or before `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekday(key));
}

/** Every date from `from` to `to`, both included. */
export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) out.push(key);
  return out;
}

/** A date for display, such as "Mon 6 Oct". The key is read as a calendar date, not an instant. */
export function formatDateKey(key: DateKey, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toUtc(key));
}
