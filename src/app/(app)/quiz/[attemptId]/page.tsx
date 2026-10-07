import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { QuizResults } from "@/features/quiz/quiz-results";
import { QuizRunner } from "@/features/quiz/quiz-runner";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { QUIZ_FORMAT_LABELS } from "@/server/modules/assessment/domain/quiz";
import { assessmentService } from "@/server/modules/assessment/service";
import { plannerService } from "@/server/modules/planner/service";

const load = cache(async (attemptId: string) => {
  if (!isUuid(attemptId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    return { ctx, attempt: await assessmentService.getAttempt(ctx, attemptId) };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps<"/quiz/[attemptId]">): Promise<Metadata> {
  const { attemptId } = await params;
  const { attempt } = await load(attemptId);
  return { title: `Quiz: ${attempt.label}` };
}

/** One quiz: the questions while it is being taken, the results once it is finished. */
export default async function QuizAttemptPage({ params }: PageProps<"/quiz/[attemptId]">) {
  const { attemptId } = await params;
  const { ctx, attempt } = await load(attemptId);

  const newQuizHref = attempt.deadlineId
    ? `/quiz?exam=${attempt.deadlineId}`
    : attempt.topicId
      ? `/quiz?topic=${attempt.topicId}`
      : attempt.subjectId
        ? `/quiz?subject=${attempt.subjectId}`
        : "/quiz";
  const back = attempt.deadlineId
    ? { href: `/exams/${attempt.deadlineId}`, label: "Back to the exam" }
    : { href: "/quiz", label: "All quizzes" };

  if (attempt.questions.length === 0) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Quiz" description={attempt.label} />
        <p className="text-muted-foreground mt-8 rounded-xl border border-dashed p-6 text-center text-sm">
          The flashcards in this quiz have been deleted.{" "}
          <Link href={newQuizHref} className="text-foreground underline underline-offset-4">
            Start a new quiz
          </Link>
          .
        </p>
      </PageContainer>
    );
  }

  if (attempt.finished) {
    const confidence = await plannerService.getConfidence(
      ctx,
      attempt.topics.map((t) => t.topicId),
    );
    return (
      <PageContainer className="max-w-3xl">
        <Link
          href={back.href}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {attempt.deadlineId ? "Exam" : "Quizzes"}
        </Link>
        <PageHeader title="Quiz results" description={`${attempt.label} · ${QUIZ_FORMAT_LABELS[attempt.format]}`} />
        <div className="mt-8">
          <QuizResults
            attempt={attempt}
            confidence={Object.fromEntries(attempt.topics.map((t) => [t.topicId, confidence.get(t.topicId) ?? null]))}
            newQuizHref={newQuizHref}
            backHref={back.href}
            backLabel={back.label}
            canWrite={ctx.role !== "viewer"}
          />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Quiz" description={attempt.label} />
      <div className="mt-6">
        <QuizRunner
          key={attempt.id}
          attemptId={attempt.id}
          exitHref={back.href}
          questions={attempt.questions.map((q) => ({
            position: q.position,
            kind: q.kind,
            type: q.type,
            ordinal: q.ordinal,
            front: q.front,
            back: q.back,
            expected: q.expected,
            options: q.options,
            answer: q.answer,
          }))}
        />
      </div>
    </PageContainer>
  );
}
