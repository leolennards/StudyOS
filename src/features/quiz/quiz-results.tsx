import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardText, ItemQuestion } from "@/features/flashcards/card-text";
import { ProgressRing } from "@/features/focus/progress-ring";
import { ConfidencePicker } from "@/features/planner/confidence-picker";
import { cn } from "@/lib/utils";
import type { assessmentService } from "@/server/modules/assessment/service";
import { itemFaces } from "@/server/modules/flashcards/domain/items";
import type { ConfidenceLevel } from "@/server/modules/planner/domain/exams";
import { RetryButton } from "./retry-button";
import { rightLine, scoreTone } from "./score-styles";

type Attempt = Awaited<ReturnType<typeof assessmentService.getAttempt>>;

/**
 * A finished quiz: the score, how it went per topic (with the student's
 * confidence beside it to adjust while the result is fresh), and the
 * questions missed with their answers.
 */
export function QuizResults({
  attempt,
  confidence,
  newQuizHref,
  backHref,
  backLabel,
  canWrite,
}: {
  attempt: Attempt;
  confidence: Record<string, ConfidenceLevel | null>;
  newQuizHref: string;
  backHref: string;
  backLabel: string;
  canWrite: boolean;
}) {
  const { score } = attempt;
  const tone = scoreTone(score.percent);
  const missed = attempt.questions.filter((q) => q.answer && !q.answer.correct);
  const skipped = attempt.questions.length - score.answered;

  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="quiz-score"
        className="bg-card flex flex-col items-center rounded-xl border px-6 py-8 text-center sm:flex-row sm:gap-6 sm:text-left"
      >
        <ProgressRing value={(score.percent ?? 0) / 100} size={104} stroke={10} barClassName={tone.ring}>
          <span className={cn("text-2xl font-semibold tabular-nums", tone.text)}>
            {score.percent === null ? "–" : `${score.percent}%`}
          </span>
        </ProgressRing>
        <div className="mt-4 min-w-0 sm:mt-0">
          <h2 id="quiz-score" className="text-lg font-semibold">
            {score.answered === 0
              ? "No questions answered"
              : score.percent === 100
                ? "Full marks!"
                : rightLine(score.correct, score.answered)}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {score.percent === 100 && `${rightLine(score.correct, score.answered)}. `}
            {skipped > 0 && `${skipped} left unanswered, which don't count. `}
            {missed.length > 0
              ? "Go over the ones you missed below, then try them again."
              : score.answered > 0
                ? "Nothing to go over this time."
                : ""}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {canWrite && missed.length > 0 && (
              <RetryButton attemptId={attempt.id} missed={missed.length} format={attempt.format} />
            )}
            <Button variant={missed.length > 0 ? "outline" : "default"} asChild>
              <Link href={newQuizHref}>
                <Plus aria-hidden />
                New quiz
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

      {attempt.topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>By topic</h2>
            </CardTitle>
            <CardDescription>
              {canWrite
                ? "Update how confident you feel while the result is fresh. Your exams use these ratings."
                : "How you did on each topic."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {attempt.topics.map((t) => {
                const topicTone = scoreTone(t.percent);
                return (
                  <li key={t.topicId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="bg-muted h-1.5 w-full max-w-40 overflow-hidden rounded-full" aria-hidden>
                          <div
                            className={cn("h-full rounded-full", topicTone.bar)}
                            style={{ width: `${t.percent ?? 0}%` }}
                          />
                        </div>
                        <span className={cn("text-xs tabular-nums", topicTone.text)}>
                          {t.answered === 0 ? "Not answered" : rightLine(t.correct, t.answered)}
                        </span>
                      </div>
                    </div>
                    {canWrite && (
                      <ConfidencePicker topicId={t.topicId} topicName={t.name} level={confidence[t.topicId] ?? null} />
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {attempt.questions.some((q) => q.answer) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{missed.length > 0 ? "Questions you missed" : "Your answers"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {(missed.length > 0 ? missed : attempt.questions.filter((q) => q.answer)).map((q) => (
                <li key={q.position} className="grid gap-1.5 py-3 text-sm">
                  <div className="flex gap-2">
                    {q.answer?.correct ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Right" />
                    ) : (
                      <X className="mt-0.5 size-4 shrink-0 text-rose-600" aria-label="Wrong" />
                    )}
                    <div className="min-w-0">
                      <ItemQuestion faces={itemFaces(q, q.ordinal)} />
                    </div>
                  </div>
                  <p className="text-muted-foreground pl-6">
                    {q.answer?.given ? (
                      <>
                        You said <CardText text={q.answer.given} className="text-foreground" />.{" "}
                      </>
                    ) : null}
                    The answer is <CardText text={q.expected} className="text-foreground font-medium" />.
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
