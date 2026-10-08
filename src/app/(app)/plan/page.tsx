import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, CalendarDays, CalendarOff } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dayLabel } from "@/features/plan/format";
import { PlanItemRow } from "@/features/plan/plan-item-row";
import { ReplanButton } from "@/features/plan/replan-button";
import { StudyWeekButton, StudyWeekForm } from "@/features/plan/study-week-form";
import { cn } from "@/lib/utils";
import { requirePageSession } from "@/server/platform/auth/session";
import { formatMinutes } from "@/server/modules/planner/domain/plan";
import { studyPlanService } from "@/server/modules/planner/plan-service";
import { plannerService } from "@/server/modules/planner/service";
import { formatDateKey } from "@/server/modules/progress/domain/calendar";

export const metadata: Metadata = { title: "Plan" };

/**
 * The weekly study plan (Architecture §28): the next seven days, each
 * filled with flashcards, topics for upcoming exams, past papers and
 * assignments, to fit the time the student says they have.
 */
export default async function PlanPage() {
  const { ctx } = await requirePageSession();
  const [week, { upcoming }] = await Promise.all([studyPlanService.getWeek(ctx), plannerService.listDeadlines(ctx)]);
  const noExams = upcoming.filter((d) => d.days >= 1).length === 0;
  const dayKeys = week.days.map((d) => d.day);

  if (!week.hasWeek) {
    return (
      <PageContainer className="max-w-4xl">
        <PageHeader title="Plan" description="A study plan for the week ahead, built around your exams." />
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>
              <h2>When can you study?</h2>
            </CardTitle>
            <CardDescription>
              Tell StudyOS roughly how much time you have each day. It fills the next seven days with your flashcards,
              the topics that need the most work before each exam, past papers in the last few days, and time for
              assignments. You can tick things off, move them or skip them, and replan whenever you like.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudyWeekForm weekMinutes={week.weekMinutes} submitLabel="Plan my week" />
          </CardContent>
        </Card>
        {noExams && <AddExamsHint className="mt-6" />}
      </PageContainer>
    );
  }

  const planned = week.days.filter((d) => d.planned);
  const total = planned.reduce((t, d) => t + d.minutes, 0);
  const done = planned.reduce((t, d) => t + d.doneMinutes, 0);
  const outdated = week.startsOn !== null && week.startsOn < week.today;

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Plan"
        description={
          total > 0
            ? `${formatMinutes(done)} of ${formatMinutes(total)} done this week.`
            : "A study plan for the week ahead, built around your exams."
        }
        actions={
          <>
            <StudyWeekButton weekMinutes={week.weekMinutes} />
            <ReplanButton />
          </>
        }
      />

      {(outdated || week.missed > 0) && (
        <div className="bg-muted/50 mt-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            {outdated && week.startsOn
              ? `This plan was made on ${formatDateKey(week.startsOn, { weekday: "long", day: "numeric", month: "long" })}. `
              : ""}
            {week.missed > 0
              ? `${week.missed} item${week.missed === 1 ? "" : "s"} from earlier days didn't get done. `
              : ""}
            Replan to fit the next seven days from today.
          </p>
          <ReplanButton label="Replan from today" variant="default" size="sm" />
        </div>
      )}

      {noExams && <AddExamsHint className="mt-6" />}

      <ol className="mt-8 grid gap-4" aria-label="Days">
        {week.days.map((d) => {
          const label = dayLabel(d.day, week.today);
          const restDay = d.free === 0 && d.items.length === 0;
          return (
            <li key={d.day} className="min-w-0">
              <section aria-label={label} className="bg-card min-w-0 rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-semibold">
                    {label}
                    {label === "Today" || label === "Tomorrow" ? (
                      <span className="text-muted-foreground ml-2 text-sm font-normal">
                        {formatDateKey(d.day, { weekday: "long", day: "numeric", month: "short" })}
                      </span>
                    ) : null}
                  </h2>
                  {d.items.length > 0 && (
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {d.doneMinutes > 0
                        ? `${formatMinutes(d.doneMinutes)} of ${formatMinutes(d.minutes)} done`
                        : formatMinutes(d.minutes)}
                    </p>
                  )}
                </div>
                {d.items.length > 0 && d.minutes > 0 && (
                  <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="bg-primary h-full rounded-full transition-[width]"
                      style={{ width: `${Math.min(100, (d.doneMinutes / d.minutes) * 100)}%` }}
                    />
                  </div>
                )}
                {d.items.length > 0 ? (
                  <ul className="mt-2 divide-y" aria-label={`Plan for ${label}`}>
                    {d.items.map((item) => (
                      <PlanItemRow key={item.id} item={item} today={week.today} days={dayKeys} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
                    {restDay ? (
                      <>
                        <CalendarOff className="size-4" aria-hidden />A day off.
                      </>
                    ) : !d.planned ? (
                      <>
                        <CalendarDays className="size-4" aria-hidden />
                        Not planned yet. Replan to fill it.
                      </>
                    ) : (
                      "Nothing planned."
                    )}
                  </p>
                )}
              </section>
            </li>
          );
        })}
      </ol>
    </PageContainer>
  );
}

function AddExamsHint({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center", className)}
    >
      <CalendarClock className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <p className="text-muted-foreground flex-1 text-sm">
        No exams coming up, so the plan only has your flashcards and assignments. Add your exam dates to get topics to
        revise and past papers to sit.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/exams?new=1">Add an exam</Link>
      </Button>
    </div>
  );
}
