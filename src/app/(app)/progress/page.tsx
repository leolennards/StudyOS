import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Brain, CalendarDays, ChartNoAxesColumnIncreasing, Clock, Flame, Target } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { colourClasses } from "@/features/knowledge/subject-colour";
import { StatTile } from "@/features/progress/stat-tile";
import { StudyHeatmap } from "@/features/progress/study-heatmap";
import { cn } from "@/lib/utils";
import { requirePageSession } from "@/server/platform/auth/session";
import { formatDateKey } from "@/server/modules/progress/domain/calendar";
import { HEATMAP_WEEKS } from "@/server/modules/progress/domain/limits";
import { formatMinutes } from "@/server/modules/progress/domain/streaks";
import { progressService } from "@/server/modules/progress/service";

export const metadata: Metadata = { title: "Progress" };

const percent = (v: number) => `${Math.round(v * 100)}%`;

function weekChange(seconds: number, previous: number) {
  if (previous === 0) return seconds > 0 ? "Your first week of studying here" : "Nothing in the week before";
  const diff = seconds - previous;
  if (Math.abs(diff) < 60) return "The same as the week before";
  return `${formatMinutes(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the week before`;
}

/**
 * Progress (Architecture §29): study time, streaks, recall and the topics
 * that need work, all computed from what the student has actually done.
 */
export default async function ProgressPage() {
  const { ctx } = await requirePageSession();
  const p = await progressService.getProgress(ctx);

  if (p.activeDays === 0) {
    return (
      <PageContainer>
        <PageHeader title="Progress" description="How your studying is going." />
        <EmptyState
          className="mt-8"
          icon={<ChartNoAxesColumnIncreasing />}
          title="Your progress will show here"
          description="Run a focus session or review some flashcards. Your study time, streak and the topics that need work will build up as you go."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/focus">Start a focus session</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/review">Review flashcards</Link>
              </Button>
            </div>
          }
        />
      </PageContainer>
    );
  }

  const heatmapDays = p.heatmap.filter((d) => !d.future && d.seconds > 0).length;
  const subjectMax = Math.max(1, ...p.subjectTime.map((s) => s.seconds));
  const subjectTotal = p.subjectTime.reduce((t, s) => t + s.seconds, 0);
  const forecastMax = Math.max(1, ...p.forecast.map((d) => d.items));
  const forecastTotal = p.forecast.reduce((t, d) => t + d.items, 0);
  const weak = p.weakTopics.filter((t) => t.recall < 0.85);

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        description="How your studying is going. Study time is your focus sessions plus time on flashcards."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings#goal-heading">
              <Target aria-hidden />
              Daily goal: {p.goalMinutes} min
            </Link>
          </Button>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Flame className="text-orange-500" />}
          label="Streak"
          value={`${p.streak} day${p.streak === 1 ? "" : "s"}`}
          detail={`Longest: ${p.longestStreak} day${p.longestStreak === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={<Target />}
          label="Today"
          value={`${Math.floor(p.todaySeconds / 60)} min`}
          detail={p.todaySeconds >= p.goalMinutes * 60 ? "Goal met" : `Goal: ${p.goalMinutes} min`}
        />
        <StatTile
          icon={<Clock />}
          label="Last 7 days"
          value={formatMinutes(p.lastWeek.seconds)}
          detail={weekChange(p.lastWeek.seconds, p.lastWeek.previousSeconds)}
        />
        <StatTile
          icon={<Brain />}
          label="Recall"
          value={p.recall.rate === null ? "Not yet" : percent(p.recall.rate)}
          detail={
            p.recall.rate === null
              ? "Shows after 10 reviews of cards you've learned"
              : `Target ${percent(p.recall.target)}, last ${p.windowDays} days`
          }
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <h2>Study calendar</h2>
          </CardTitle>
          <CardDescription>
            {p.lastWeek.daysAtGoal} of the last 7 days at your goal. {heatmapDays} days of study in the last{" "}
            {HEATMAP_WEEKS} weeks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudyHeatmap
            days={p.heatmap}
            summary={`Study calendar: ${heatmapDays} days of study in the last ${HEATMAP_WEEKS} weeks, ${p.lastWeek.daysAtGoal} of the last 7 at your goal.`}
          />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Time per subject</h2>
            </CardTitle>
            <CardDescription>
              {subjectTotal > 0 ? `${formatMinutes(subjectTotal)} in the last ${p.windowDays} days` : "Nothing yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {p.subjectTime.length === 0 ? (
              <p className="text-muted-foreground text-sm">No study time in the last {p.windowDays} days.</p>
            ) : (
              <ul className="grid gap-3">
                {p.subjectTime.map((s) => (
                  <li key={s.subjectId ?? "none"} className="grid gap-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      {s.colour ? (
                        <SubjectDot colour={s.colour} />
                      ) : (
                        <span className="bg-muted size-2.5 rounded-full" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{s.name ?? "No particular subject"}</span>
                      <span className="text-muted-foreground tabular-nums">{formatMinutes(s.seconds)}</span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                      <div
                        className={cn(
                          "h-full rounded-full",
                          s.colour ? colourClasses(s.colour).dot : "bg-muted-foreground/40",
                        )}
                        style={{ width: `${Math.max(2, (s.seconds / subjectMax) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Reviews coming up</h2>
            </CardTitle>
            <CardDescription>
              {forecastTotal > 0
                ? `${forecastTotal} card review${forecastTotal === 1 ? "" : "s"} due in the next 7 days`
                : "No reviews due in the next 7 days"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid h-40 grid-cols-7 items-end gap-2" aria-label="Reviews due each day">
              {p.forecast.map((d, i) => (
                <li key={d.day} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <span className="text-muted-foreground text-xs tabular-nums">{d.items}</span>
                  <span aria-hidden className="flex w-full flex-1 items-end justify-center">
                    <span
                      className={cn("w-full max-w-10 rounded-t-md", i === 0 ? "bg-primary" : "bg-primary/40")}
                      style={{ height: `${d.items === 0 ? 2 : Math.max(6, (d.items / forecastMax) * 100)}%` }}
                    />
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {i === 0 ? "Today" : formatDateKey(d.day, { weekday: "short" })}
                  </span>
                  <span className="sr-only">
                    {formatDateKey(d.day, { weekday: "long", day: "numeric", month: "long" })}: {d.items} due
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <h2>Topics to work on</h2>
          </CardTitle>
          <CardDescription>
            Topics whose flashcards you forget most often, from the last {p.windowDays} days of reviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {weak.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <CalendarDays className="size-4" aria-hidden />
              {p.weakTopics.length === 0
                ? "Link your flashcards to topics and review them a few times; topics that need work will show here."
                : "Nothing stands out: you remember at least 85% of the cards in every topic you've reviewed."}
            </p>
          ) : (
            <ul className="-mx-2 grid">
              {weak.map((t) => (
                <li key={t.topicId}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5">
                    <SubjectDot colour={t.colour} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.topicName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {t.subjectName} · forgot {t.forgot} of {t.ratings} reviews
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                        t.recall < 0.7
                          ? "bg-red-500/10 text-red-700 dark:text-red-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {percent(t.recall)} recall
                    </span>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/subjects/${t.subjectId}/flashcards?topic=${t.topicId}`}>
                        Open cards
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
