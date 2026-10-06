import { cn } from "@/lib/utils";
import { type DateKey, formatDateKey } from "@/server/modules/progress/domain/calendar";
import { formatMinutes } from "@/server/modules/progress/domain/streaks";
import { LEVEL_CLASSES, LEVEL_LABELS } from "./study-levels";

type Day = { day: DateKey; seconds: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

/**
 * A calendar heatmap of study time (Architecture §29): one column per week,
 * Monday at the top, shaded against the daily goal. Each square has a
 * tooltip; screen readers get the summary in the label instead.
 */
export function StudyHeatmap({ days, summary }: { days: Day[]; summary: string }) {
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  // A month label above the first week that starts in that month.
  const months = weeks.map((week, i) => {
    const month = formatDateKey(week[0]!.day, { month: "short" });
    const previous = i > 0 ? formatDateKey(weeks[i - 1]![0]!.day, { month: "short" }) : null;
    return month !== previous ? month : "";
  });

  return (
    <figure className="grid gap-3">
      <div className="overflow-x-auto pb-1">
        <div role="img" aria-label={summary} className="inline-grid min-w-max gap-1">
          <div className="text-muted-foreground ml-8 flex gap-1 text-[0.65rem]" aria-hidden>
            {months.map((m, i) => (
              <span key={i} className="w-3 overflow-visible whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <div className="text-muted-foreground grid w-7 grid-rows-7 gap-1 text-[0.65rem]" aria-hidden>
              {WEEKDAY_LABELS.map((l, i) => (
                <span key={i} className="h-3 leading-3">
                  {l}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]!.day} className="grid grid-rows-7 gap-1">
                {week.map((d) => (
                  <span
                    key={d.day}
                    data-day={d.day}
                    data-level={d.level}
                    title={
                      d.future
                        ? undefined
                        : `${formatDateKey(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${d.seconds > 0 ? formatMinutes(d.seconds) : "no study"}`
                    }
                    className={cn("size-3 rounded-[3px]", d.future ? "bg-transparent" : LEVEL_CLASSES[d.level])}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
        Less
        {LEVEL_CLASSES.map((c, i) => (
          <span key={c} title={LEVEL_LABELS[i]} className={cn("size-3 rounded-[3px]", c)} aria-hidden />
        ))}
        More
      </figcaption>
    </figure>
  );
}
