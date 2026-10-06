import Link from "next/link";
import { Flame, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "@/features/focus/progress-ring";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/server/modules/progress/domain/streaks";
import type { progressService } from "@/server/modules/progress/service";
import { WeekStrip } from "./week-strip";

type Habits = Awaited<ReturnType<typeof progressService.getHabits>>;

function streakLine(h: Habits) {
  if (h.streak === 0)
    return h.longestStreak > 0 ? "Study today to start a new streak." : "Study today to start a streak.";
  if (!h.studiedToday) return "Study today to keep it going.";
  if (h.streak >= h.longestStreak && h.streak > 1) return "Your longest yet.";
  return "Nice work. See you tomorrow.";
}

/**
 * Today's study at a glance: time against the daily goal, the streak and
 * the week. Study time is focus sessions plus time on flashcards.
 */
export function HabitsCard({ habits }: { habits: Habits }) {
  const goalSeconds = habits.goalMinutes * 60;
  const share = habits.todaySeconds / goalSeconds;
  const minutes = Math.floor(habits.todaySeconds / 60);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Today&apos;s goal</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-5">
          <ProgressRing
            value={share}
            size={104}
            stroke={10}
            barClassName={habits.goalMet ? "text-success" : "text-primary"}
          >
            <div>
              <p className="text-2xl leading-none font-semibold tabular-nums">{minutes}</p>
              <p className="text-muted-foreground mt-1 text-xs">of {habits.goalMinutes} min</p>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="font-medium">
              {habits.goalMet
                ? "Goal met. Well done!"
                : habits.todaySeconds > 0
                  ? `${formatMinutes(goalSeconds - habits.todaySeconds)} to go`
                  : "Nothing yet today"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <Flame
                className={cn("size-4", habits.streak > 0 ? "text-orange-500" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="font-medium tabular-nums">
                {habits.streak} day{habits.streak === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">streak</span>
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm">{streakLine(habits)}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <WeekStrip days={habits.week} today={habits.today} />
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/focus">
                <Timer aria-hidden />
                Start a focus session
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/progress">See your progress</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
