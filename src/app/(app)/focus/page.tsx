import Link from "next/link";
import type { Metadata } from "next";
import { Flame } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FocusPanel } from "@/features/focus/focus-panel";
import { ProgressRing } from "@/features/focus/progress-ring";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { formatMinutes } from "@/server/modules/progress/domain/streaks";
import { progressService } from "@/server/modules/progress/service";

export const metadata: Metadata = { title: "Focus" };

/** The focus timer (Architecture §28): timed blocks of study with short breaks, counted towards the daily goal. */
export default async function FocusPage() {
  const { ctx } = await requirePageSession();
  const [subjects, habits] = await Promise.all([knowledgeService.listSubjects(ctx), progressService.getHabits(ctx)]);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Focus"
        description="Study in focused blocks with short breaks in between. Focus time counts towards your daily goal."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_17rem]">
        <FocusPanel subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} />
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Today</h2>
              </CardTitle>
              <CardDescription>
                {habits.todaySessions === 0
                  ? "No focus sessions yet."
                  : `${habits.todaySessions} focus session${habits.todaySessions === 1 ? "" : "s"}, ${formatMinutes(habits.todayFocusSeconds)}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <ProgressRing
                value={habits.todaySeconds / (habits.goalMinutes * 60)}
                size={72}
                stroke={8}
                barClassName={habits.goalMet ? "text-success" : "text-primary"}
              >
                <span className="text-sm font-semibold tabular-nums">{Math.floor(habits.todaySeconds / 60)}</span>
              </ProgressRing>
              <div className="text-sm">
                <p className="font-medium">
                  {Math.floor(habits.todaySeconds / 60)} of {habits.goalMinutes} min
                </p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1">
                  <Flame className="size-3.5 text-orange-500" aria-hidden />
                  {habits.streak} day streak
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>How it works</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground grid gap-2 text-sm">
              <p>Pick one thing to work on, then study until the timer ends. Put your phone out of reach.</p>
              <p>Take the break when it comes: short rests help you keep going for longer.</p>
              <p>
                Change your daily goal in{" "}
                <Link href="/settings#goal-heading" className="text-primary underline-offset-4 hover:underline">
                  Settings
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
