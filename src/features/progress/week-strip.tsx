import { cn } from "@/lib/utils";
import { type DateKey, formatDateKey } from "@/server/modules/progress/domain/calendar";
import { formatMinutes } from "@/server/modules/progress/domain/streaks";
import { LEVEL_CLASSES } from "./study-levels";

/** The last seven days, today last, each shaded by study time against the goal. */
export function WeekStrip({
  days,
  today,
}: {
  days: { day: DateKey; seconds: number; level: 0 | 1 | 2 | 3 | 4 }[];
  today: DateKey;
}) {
  return (
    <ol aria-label="The last seven days" className="grid max-w-md grid-cols-7 gap-1.5">
      {days.map((d) => {
        const name = formatDateKey(d.day, { weekday: "short" });
        return (
          <li key={d.day} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "h-8 w-full max-w-9 rounded-md",
                LEVEL_CLASSES[d.level],
                d.day === today && "ring-ring/60 ring-2 ring-offset-2 ring-offset-[var(--card)]",
              )}
              aria-hidden
            />
            <span
              className={cn("text-muted-foreground text-[0.7rem]", d.day === today && "text-foreground font-medium")}
            >
              {name.slice(0, 1)}
            </span>
            <span className="sr-only">
              {formatDateKey(d.day, { weekday: "long" })}: {d.seconds > 0 ? formatMinutes(d.seconds) : "no study"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
