import { formatDateKey } from "@/server/modules/progress/domain/calendar";

/** "Tue 20 Oct", with the year added when it isn't this year's. */
export function formatDue(dueOn: string, today: string, startsAt?: string | null) {
  const sameYear = dueOn.slice(0, 4) === today.slice(0, 4);
  const date = formatDateKey(dueOn, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return startsAt ? `${date}, ${startsAt}` : date;
}

/** The big number on a countdown and the word under it. */
export function countdownParts(days: number): { value: string; unit: string } {
  if (days === 0) return { value: "Today", unit: "" };
  if (days < 0) return { value: String(-days), unit: -days === 1 ? "day ago" : "days ago" };
  return { value: String(days), unit: days === 1 ? "day to go" : "days to go" };
}
