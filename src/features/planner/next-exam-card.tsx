import Link from "next/link";
import { ArrowRight, CircleHelp, GalleryVerticalEnd, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LABELS, KIND_LABELS } from "@/server/modules/planner/domain/exams";
import type { plannerService } from "@/server/modules/planner/service";
import { CONFIDENCE_CLASSES } from "./confidence-styles";
import { CountdownTile } from "./countdown-tile";
import { formatDue } from "./format";
import { ReadinessBar, readinessLine } from "./readiness-bar";

type NextExam = NonNullable<Awaited<ReturnType<typeof plannerService.getNextDeadline>>>;

/**
 * The next exam on Today: how long is left, how ready the student feels,
 * and the topics to work on first, with a way straight into studying them.
 */
export function NextExamCard({ exam, today }: { exam: NextExam; today: string }) {
  const kind = KIND_LABELS[exam.kind].toLowerCase();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>
          <h2>Next {kind}</h2>
        </CardTitle>
        <Link
          href="/exams"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          {exam.laterCount > 0 ? `${exam.laterCount} more coming up` : "All exams"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 items-center gap-4">
          <CountdownTile days={exam.days} className="size-20" />
          <div className="min-w-0">
            <Link
              href={`/exams/${exam.id}`}
              className="block truncate font-semibold underline-offset-4 hover:underline"
            >
              {exam.title}
            </Link>
            <p className="text-muted-foreground mt-1 text-sm">{formatDue(exam.dueOn, today, exam.startsAt)}</p>
            {exam.subject && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                <SubjectDot colour={exam.subject.colour} />
                {exam.subject.name}
              </p>
            )}
          </div>
        </div>

        <div className="grid content-start gap-3">
          {exam.readiness.total > 0 && (
            <div className="grid gap-1.5">
              <ReadinessBar readiness={exam.readiness} />
              <p className="text-muted-foreground text-xs">{readinessLine(exam.readiness)}</p>
            </div>
          )}
          {exam.workOn.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Work on these first</h3>
              <ul className="mt-1 grid gap-0.5">
                {exam.workOn.map((t) => (
                  <li key={t.topicId}>
                    <Link
                      href={
                        t.cards > 0 && exam.subject
                          ? `/review?subject=${exam.subject.id}&topic=${t.topicId}`
                          : `/exams/${exam.id}`
                      }
                      className="hover:bg-accent focus-visible:ring-ring/50 -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          t.confidence ? CONFIDENCE_CLASSES[t.confidence].dot : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {t.confidence ? CONFIDENCE_LABELS[t.confidence] : "Not rated"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exam.subject && exam.days >= 0 && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={`/review?subject=${exam.subject.id}`}>
                  <GalleryVerticalEnd aria-hidden />
                  Review {exam.subject.name}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/quiz?exam=${exam.id}`}>
                  <CircleHelp aria-hidden />
                  Quiz
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/focus?subject=${exam.subject.id}`}>
                  <Timer aria-hidden />
                  Focus
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
