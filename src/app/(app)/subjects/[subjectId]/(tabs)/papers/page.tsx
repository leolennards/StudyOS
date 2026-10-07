import Link from "next/link";
import { FileText, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTakenOn, paperFacts } from "@/features/papers/format";
import { AddPaperButton } from "@/features/papers/paper-actions";
import { requirePageSession } from "@/server/platform/auth/session";
import { percent } from "@/server/modules/exams/domain/papers";
import { examsService, type PaperSummary } from "@/server/modules/exams/service";
import { libraryService } from "@/server/modules/library/service";

const TREND = {
  up: { icon: TrendingUp, label: "Up on last time", className: "text-success" },
  down: { icon: TrendingDown, label: "Down on last time", className: "text-destructive" },
  same: { icon: Minus, label: "Same as last time", className: "text-muted-foreground" },
} as const;

/**
 * A subject's past papers (Architecture §22): the papers with the student's
 * scores, and how the marks across them are spread over the subject's
 * topics. The layout has already checked the subject exists.
 */
export default async function SubjectPapersPage({ params }: PageProps<"/subjects/[subjectId]/papers">) {
  const { subjectId } = await params;
  const { ctx } = await requirePageSession();
  const [{ papers, analysis, focus }, documents] = await Promise.all([
    examsService.getSubjectPapers(ctx, subjectId),
    libraryService.listDocuments(ctx, subjectId),
  ]);
  const documentOptions = documents.map((d) => ({ id: d.id, title: d.title, kind: d.kind }));

  if (papers.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No past papers yet"
        description="Add the past papers you have, enter their questions and marks, and log each one you sit. You'll see which topics carry the most marks and where you're losing them."
        action={<AddPaperButton subjectId={subjectId} documents={documentOptions} />}
      />
    );
  }

  const sampled = analysis.paperCount;
  const scored = analysis.topics.some((t) => t.score !== null);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <AddPaperButton subjectId={subjectId} documents={documentOptions} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Where the marks are</h2>
          </CardTitle>
          <CardDescription>
            {sampled === 0
              ? "Enter the questions on a paper, with the topics each one tests, to see which topics are worth the most marks."
              : `From the ${sampled === 1 ? "questions on 1 paper" : `questions on ${sampled} papers`}, ${analysis.totalMarks} marks in all${scored ? ", and your latest attempt at each" : ""}.${sampled < 3 ? " A few more papers will make this more reliable." : ""}`}
          </CardDescription>
        </CardHeader>
        {analysis.topics.length > 0 && (
          <CardContent className="grid gap-5">
            {focus.length > 0 && (
              <div className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
                <p className="font-medium">Work on first</p>
                <p className="text-muted-foreground">
                  {focus
                    .map((t) =>
                      t.score === null
                        ? `${t.name} (${percent(t.share)} of marks, not attempted yet)`
                        : `${t.name} (you lost ${percent(t.lost)} of all marks here)`,
                    )
                    .join(", ")}
                </p>
              </div>
            )}
            <ul aria-label="Topics by marks" className="grid gap-3">
              {analysis.topics.map((t) => (
                <li key={t.topicId} className="grid gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {percent(t.share)} of marks · in {t.papers} of {sampled} ·{" "}
                      {t.score === null ? "not attempted" : `you got ${percent(t.score)}`}
                    </span>
                  </div>
                  <div className="bg-muted relative h-2 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="bg-primary/30 absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${t.share * 100}%` }}
                    />
                    {t.score !== null && (
                      <div
                        className="bg-primary absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${t.share * t.score * 100}%` }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {analysis.untaggedShare > 0 && (
              <p className="text-muted-foreground text-sm">
                {percent(analysis.untaggedShare)} of the marks are on questions with no topic.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      <ul aria-label="Past papers" className="bg-card divide-y overflow-hidden rounded-xl border">
        {papers.map((p) => (
          <PaperRow key={p.id} subjectId={subjectId} paper={p} />
        ))}
      </ul>
    </div>
  );
}

function PaperRow({ subjectId, paper }: { subjectId: string; paper: PaperSummary }) {
  const facts = paperFacts(paper);
  const trend = paper.trend ? TREND[paper.trend] : null;
  return (
    <li className="relative flex items-center gap-3 p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/subjects/${subjectId}/papers/${paper.id}`}
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-[3px]"
        >
          {paper.title}
        </Link>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {[
            ...facts,
            paper.attempts.length > 0
              ? `sat ${paper.attempts.length === 1 ? "once" : `${paper.attempts.length} times`}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No details yet"}
        </p>
      </div>
      <div className="text-right text-sm">
        {paper.latest ? (
          <>
            <p className="flex items-center justify-end gap-1 font-semibold tabular-nums">
              {trend && <trend.icon className={`size-4 ${trend.className}`} aria-label={trend.label} />}
              {percent(paper.latest.share)}
            </p>
            <p className="text-muted-foreground text-xs">{formatTakenOn(paper.latest.takenOn)}</p>
          </>
        ) : (
          <p className="text-muted-foreground">Not sat yet</p>
        )}
      </div>
    </li>
  );
}
