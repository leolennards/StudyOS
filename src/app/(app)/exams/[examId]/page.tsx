import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { ChevronLeft, GalleryVerticalEnd, ListPlus, Timer } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { topicGroups } from "@/features/knowledge/topic-groups";
import { CountdownTile } from "@/features/planner/countdown-tile";
import { DeadlineActions } from "@/features/planner/deadline-actions";
import { ExamTopics, type TopicStanding } from "@/features/planner/exam-topics";
import { formatDue } from "@/features/planner/format";
import { ReadinessBar, readinessLine } from "@/features/planner/readiness-bar";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { countdownLabel, KIND_LABELS } from "@/server/modules/planner/domain/exams";
import { plannerService } from "@/server/modules/planner/service";

const load = cache(async (examId: string) => {
  if (!isUuid(examId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const [exam, subjects] = await Promise.all([
      plannerService.getDeadline(ctx, examId),
      knowledgeService.listSubjects(ctx),
    ]);
    return { exam, subjects };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps<"/exams/[examId]">): Promise<Metadata> {
  const { examId } = await params;
  const { exam } = await load(examId);
  return { title: exam.title };
}

/**
 * One exam (Architecture §28): the countdown, how ready the student feels,
 * and the checklist of topics it covers with a confidence rating for each.
 */
export default async function ExamPage({ params }: PageProps<"/exams/[examId]">) {
  const { examId } = await params;
  const { exam, subjects } = await load(examId);
  const { readiness } = exam;
  const subjectOptions = subjects.map((s) => ({ id: s.id, name: s.name }));
  // An archived subject isn't in the list, but the exam still belongs to it.
  if (exam.subject && !subjectOptions.some((s) => s.id === exam.subject!.id)) {
    subjectOptions.push({ id: exam.subject.id, name: exam.subject.name });
  }
  const standings: Record<string, TopicStanding> = Object.fromEntries(
    exam.topics.map((t) => [t.topicId, { confidence: t.confidence, cards: t.cards, recall: t.recall }]),
  );
  const passed = exam.days < 0;

  return (
    <PageContainer className="max-w-4xl">
      <Link
        href="/exams"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Exams
      </Link>
      <PageHeader
        title={exam.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{KIND_LABELS[exam.kind]}</span>
            {exam.subject && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/subjects/${exam.subject.id}`}
                  className="hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                >
                  <SubjectDot colour={exam.subject.colour} />
                  {exam.subject.name}
                </Link>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{formatDue(exam.dueOn, exam.today, exam.startsAt)}</span>
            {exam.location && (
              <>
                <span aria-hidden>·</span>
                <span>{exam.location}</span>
              </>
            )}
          </span>
        }
        actions={
          <DeadlineActions
            subjects={subjectOptions}
            deadline={{
              id: exam.id,
              kind: exam.kind,
              title: exam.title,
              subjectId: exam.subject?.id ?? null,
              dueOn: exam.dueOn,
              startsAt: exam.startsAt,
              location: exam.location,
            }}
          />
        }
      />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{passed ? "Finished" : "Countdown"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <CountdownTile days={exam.days} className="size-20" />
            <p className="text-muted-foreground text-sm">
              {passed
                ? "This one's behind you. Delete it, or keep it as a record."
                : exam.days === 0
                  ? "Good luck today!"
                  : `${countdownLabel(exam.days)}, on ${formatDue(exam.dueOn, exam.today)}.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>How ready you feel</h2>
            </CardTitle>
            <CardDescription>From your rating of each topic.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-2xl font-semibold tabular-nums">
              {readiness.score === null ? "–" : `${Math.round(readiness.score * 100)}%`}
            </p>
            <ReadinessBar readiness={readiness} />
            <p className="text-muted-foreground text-xs">{readinessLine(readiness)}</p>
          </CardContent>
        </Card>

        {exam.subject && !passed && (
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>
                <h2>Study for it</h2>
              </CardTitle>
              <CardDescription>
                {exam.workOn[0] ? `Start with ${exam.workOn[0].name}.` : "Keep your topics fresh."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild>
                <Link href={`/review?subject=${exam.subject.id}`}>
                  <GalleryVerticalEnd aria-hidden />
                  Review {exam.subject.name}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/focus?subject=${exam.subject.id}`}>
                  <Timer aria-hidden />
                  Start a focus session
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-6">
        {!exam.subject ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Topics</h2>
              </CardTitle>
              <CardDescription>
                Choose a subject for this exam (Edit, above) to get a checklist of its topics to rate.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : !exam.tree || exam.tree.topicCount === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Topics</h2>
              </CardTitle>
              <CardDescription>
                {exam.subject.name} has no topics yet. Add the topics you need to learn, then rate each one here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/subjects/${exam.subject.id}`}>
                  <ListPlus aria-hidden />
                  Add topics
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ExamTopics
            deadlineId={exam.id}
            subjectId={exam.subject.id}
            groups={topicGroups(exam.tree.sections, exam.tree.unsectioned)}
            covered={exam.topics.map((t) => t.topicId)}
            coversWholeSubject={exam.coversWholeSubject}
            standings={standings}
          />
        )}
      </div>
    </PageContainer>
  );
}
