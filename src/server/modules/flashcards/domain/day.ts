/**
 * The student's day, in their own time zone. Daily limits (new cards and
 * reviews per day) reset at local midnight, and "due today" means due
 * before the end of the local day.
 */

/** Minutes the zone is ahead of UTC at `at` (negative west of Greenwich). */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The calendar date in the zone at `at`, as year, month (1–12) and day. */
function localDate(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** The instant local midnight falls on, for a calendar date in the zone. */
function midnight(year: number, month: number, day: number, timeZone: string): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  // Two passes settle the offset on days when the clocks change.
  let guess = utcMidnight - zoneOffsetMinutes(new Date(utcMidnight), timeZone) * 60_000;
  guess = utcMidnight - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

/** The start of the student's current day: local midnight in their time zone. */
export function startOfDay(at: Date, timeZone: string): Date {
  const { year, month, day } = localDate(at, timeZone);
  return midnight(year, month, day, timeZone);
}

/** The start of the student's next day. */
export function endOfDay(at: Date, timeZone: string): Date {
  const { year, month, day } = localDate(at, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return midnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
}
