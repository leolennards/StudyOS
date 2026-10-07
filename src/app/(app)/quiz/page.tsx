import Link from "next/link";
import type { Metadata } from "next";
import { CircleHelp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { QuizSetup, type QuizSource } from "@/features/quiz/quiz-setup";
import { scoreTone } from "@/features/quiz/score-styles";
import { cn } from "@/lib/utils";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { assessmentService } from "@/server/modules/assessment/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { plannerService } from "@/server/modules/planner/service";

export const metadata: Metadata = { title: "Quiz" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * Quiz (Architecture §19, ADR-017): practice quizzes made from the student's
 * flashcards, on everything, a subject, a topic (`?topic=`) or an exam
 * (`?exam=`), with the latest results.
 */
export default async function QuizPage({ searchParams }: PageProps<"/quiz">) {
  const { subject, topic, exam } = await searchParams;
  const { ctx } = await requirePageSession();
  const [subjects, cardCount, { upcoming }, recent] = await Promise.all([
    knowledgeService.listSubjects(ctx),
    flashcardsService.countCards(ctx),
    plannerService.listDeadlines(ctx),
    assessmentService.listRecent(ctx),
  ]);

  const sources: QuizSource[] = [
    ...upcoming
      .filter((d) => d.subject !== null)
      .map((d) => ({ value: `exam:${d.id}`, label: d.title, group: "exam" as const })),
    ...subjects.map((s) => ({ value: `subject:${s.id}`, label: s.name, group: "subject" as const })),
  ];
  let defaultSource = "";
  if (typeof exam === "string" && sources.some((s) => s.value === `exam:${exam}`)) defaultSource = `exam:${exam}`;
  else if (typeof topic === "string" && isUuid(topic)) {
    const [found] = await knowledgeService.findTopics(ctx, [topic]);
    const parent = found && subjects.find((s) => s.id === found.subjectId);
    if (found && parent) {
      sources.unshift({ value: `topic:${found.id}`, label: `${parent.name} · ${found.name}`, group: "topic" });
      defaultSource = `topic:${found.id}`;
    }
  } else if (typeof subject === "string" && sources.some((s) => s.value === `subject:${subject}`)) {
    defaultSource = `subject:${subject}`;
  }

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Quiz" description="Test yourself on your flashcards and see which topics need more work." />
      <div className="mt-8">
        {cardCount === 0 ? (
          <EmptyState
            icon={<CircleHelp />}
            title="No flashcards to quiz you on"
            description="Quizzes are made from your flashcards. Add some cards to a subject, then come back."
            action={
              subjects[0] ? (
                <Button asChild>
                  <Link href={`/subjects/${subjects[0].id}/flashcards`}>Add flashcards</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/subjects?new=1">Add a subject</Link>
                </Button>
              )
            }
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>New quiz</h2>
                </CardTitle>
                <CardDescription>
                  Practice only: quizzes don&apos;t change when your flashcards are due for review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QuizSetup key={defaultSource} sources={sources} defaultSource={defaultSource} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Recent quizzes</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Your results will appear here.</p>
                ) : (
                  <ul className="-mx-2 grid gap-0.5">
                    {recent.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/quiz/${r.id}`}
                          className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-[3px]"
                        >
                          {r.subject ? (
                            <SubjectDot colour={r.subject.colour} />
                          ) : (
                            <span className="bg-muted-foreground/40 size-2 shrink-0 rounded-full" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{r.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {dateFormat.format(r.startedAt)} ·{" "}
                              {r.finished
                                ? `${r.correct} of ${r.answered} right`
                                : `${r.answered} of ${r.questions} answered`}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              r.finished ? scoreTone(r.percent).text : "text-primary",
                            )}
                          >
                            {r.finished ? (r.percent === null ? "–" : `${r.percent}%`) : "Continue"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
