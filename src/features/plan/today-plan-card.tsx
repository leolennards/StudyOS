import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes, planDays } from "@/server/modules/planner/domain/plan";
import type { studyPlanService } from "@/server/modules/planner/plan-service";
import { PlanItemRow } from "./plan-item-row";
import { ReplanButton } from "./replan-button";

type TodayPlan = Awaited<ReturnType<typeof studyPlanService.getToday>>;

/** Today's part of the study plan, on the Today page, or a way to make one. */
export function TodayPlanCard({ plan }: { plan: TodayPlan }) {
  if (!plan) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1.5">
            <CardTitle>
              <h2>Plan your week</h2>
            </CardTitle>
            <CardDescription>
              Say when you can study and get a day-by-day plan built around your exams and flashcards.
            </CardDescription>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/plan">
              <CalendarCheck aria-hidden />
              Make a plan
            </Link>
          </Button>
        </CardHeader>
      </Card>
    );
  }

  const active = plan.items.filter((i) => i.status !== "skipped");
  const total = active.reduce((t, i) => t + i.minutes, 0);
  const done = active.filter((i) => i.status === "done").reduce((t, i) => t + i.minutes, 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>
            <h2>Today&apos;s plan</h2>
          </CardTitle>
          {total > 0 && (
            <CardDescription>
              {done >= total ? "All done for today." : `${formatMinutes(done)} of ${formatMinutes(total)} done`}
            </CardDescription>
          )}
        </div>
        <Link
          href="/plan"
          className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          The week
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {plan.ended ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
            <p className="text-muted-foreground text-sm">Your plan has run out. Make one for the week ahead.</p>
            <ReplanButton label="Plan the week" variant="default" size="sm" />
          </div>
        ) : plan.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing planned for today.</p>
        ) : (
          <ul className="-my-2 divide-y" aria-label="Today's plan">
            {plan.items.map((item) => (
              <PlanItemRow key={item.id} item={item} today={plan.today} days={planDays(plan.today)} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
