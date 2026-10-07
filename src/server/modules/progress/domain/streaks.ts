import { addDays, type DateKey, daysBetween } from "./calendar";

/**
 * Streaks (Architecture §29): consecutive days with any study. Framed gently:
 * a day counts if the student studied at all, not only if they met the goal,
 * and today not being done yet doesn't break the streak until it is over.
 */
export function streaks(activeDays: Iterable<DateKey>, today: DateKey) {
  const days = [...new Set(activeDays)].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  let previous: DateKey | null = null;
  for (const day of days) {
    run = previous !== null && daysBetween(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const last = days.at(-1);
  // The run ending on the last active day is current if that day is today or yesterday.
  const current = last && (last === today || last === addDays(today, -1)) ? run : 0;
  return { current, longest, studiedToday: last === today };
}

/** Heatmap shade, 0 to 4, for a day's study time against the goal. */
export function intensity(seconds: number, goalMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  const share = seconds / (goalMinutes * 60);
  if (share < 0.5) return 1;
  if (share < 1) return 2;
  if (share < 1.5) return 3;
  return 4;
}

/** A duration for people: "45 min", "1 h 20 min", "under a minute". */
export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (seconds > 0 && minutes === 0) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
