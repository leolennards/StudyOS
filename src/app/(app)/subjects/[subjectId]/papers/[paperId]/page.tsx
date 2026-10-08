import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { BookOpenCheck, ChevronLeft, FileText, Timer } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { topicGroups } from "@/features/knowledge/topic-groups";
import { AttemptsList } from "@/features/papers/attempts-list";
import { formatTakenOn, paperFacts } from "@/features/papers/format";
import { LogAttemptButton } from "@/features/papers/log-attempt-dialog";
import { PaperActions } from "@/features/papers/paper-actions";
import { QuestionsCard } from "@/features/papers/questions-card";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { percent } from "@/server/modules/exams/domain/papers";
import { examsService } from "@/server/modules/exams/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";

const load = cache(async (subjectId: string, paperId: string) => {
  if (!isUuid(subjectId) || !isUuid(paperId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const paper = await examsService.getPaper(ctx, paperId);
    if (paper.subjectId !== subjectId) notFound();
    const [tree, documents] = await Promise.all([
      knowledgeService.getSubjectTree(ctx, subjectId),
      libraryService.listDocuments(ctx, subjectId),
    ]);
    return { paper, tree, documents };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/subjects/[subjectId]/papers/[paperId]">): Promise<Metadata> {
  const { subjectId, paperId } = await params;
  const { paper } = await load(subjectId, paperId);
  return { title: paper.title };
}

/**
 * One past paper: its questions with their marks and topics, and every
 * attempt at it. Sitting it happens away from the screen; the student
 * logs their marks here afterwards.
 */
export default async function PaperPage({ params }: PageProps<"/subjects/[subjectId]/papers/[paperId]">) {
  const { subjectId, paperId } = await params;
  const { paper, tree, documents } = await load(subjectId, paperId);
  const latest = paper.latest;
  const latestMarks = latest ? paper.marks[latest.id] : undefined;
  const facts = paperFacts(paper);
  const attempts = [...paper.attempts].reverse();

  return (
    <PageContainer className="max-w-4xl">
      <Link
        href={`/subjects/${subjectId}/papers`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tree.subject.name} past papers
      </Link>
      <PageHeader
        title={paper.title}
        description={facts.length > 0 ? facts.join(" · ") : undefined}
        actions={
          <PaperActions
            subjectId={subjectId}
            documents={documents.map((d) => ({ id: d.id, title: d.title, kind: d.kind }))}
            attemptCount={paper.attempts.length}
            paper={{
              id: paper.id,
              title: paper.title,
              year: paper.year,
              durationMin: paper.durationMin,
              totalMarks: paper.totalMarks,
              documentId: paper.documentId,
              markSchemeId: paper.markSchemeId,
            }}
          />
        }
      />

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Sit it</h2>
            </CardTitle>
            <CardDescription>
              {paper.durationMin
                ? `Give yourself ${paper.durationMin} minutes, as in the exam, then mark it and log your marks.`
                : "Sit it as in the exam, then mark it and log your marks."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {paper.document && (
              <Button asChild variant="outline">
                <Link href={`/subjects/${subjectId}/documents/${paper.document.id}`}>
                  <FileText aria-hidden />
                  Open the paper
                </Link>
              </Button>
            )}
            {paper.markScheme && (
              <Button asChild variant="outline">
                <Link href={`/subjects/${subjectId}/documents/${paper.markScheme.id}`}>
                  <BookOpenCheck aria-hidden />
                  Open the mark scheme
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/focus?subject=${subjectId}`}>
                <Timer aria-hidden />
                Start a focus session
              </Link>
            </Button>
            <LogAttemptButton
              paperId={paper.id}
              today={paper.today}
              totalMarks={paper.total}
              questions={paper.questions.map((q) => ({ id: q.id, number: q.number, marks: q.marks }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your attempts</h2>
            </CardTitle>
            <CardDescription>
              {latest
                ? paper.best && paper.best.id !== latest.id
                  ? `Latest ${percent(latest.share)}, best ${percent(paper.best.share)}.`
                  : `Latest ${percent(latest.share)}.`
                : "Not sat yet. Your scores will show here."}
            </CardDescription>
          </CardHeader>
          {attempts.length > 0 && (
            <CardContent>
              <AttemptsList
                attempts={attempts.map((a) => ({
                  id: a.id,
                  date: formatTakenOn(a.takenOn),
                  score: a.score,
                  outOf: a.outOf,
                  share: a.share,
                  minutes: a.minutes,
                  best: paper.best?.id === a.id,
                }))}
              />
            </CardContent>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <QuestionsCard
          // Saved questions come back with ids: start the editor again from them.
          key={paper.questions.map((q) => q.id).join()}
          paperId={paper.id}
          groups={topicGroups(tree.sections, tree.unsectioned)}
          questions={paper.questions}
          hasAttempts={paper.attempts.length > 0}
          latest={
            latest && latestMarks && Object.keys(latestMarks).length > 0
              ? { label: formatTakenOn(latest.takenOn), marks: latestMarks }
              : null
          }
        />
      </div>
    </PageContainer>
  );
}
