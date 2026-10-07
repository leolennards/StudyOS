import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, MapPin } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { CountdownTile } from "@/features/planner/countdown-tile";
import { formatDue } from "@/features/planner/format";
import { NewDeadlineButton } from "@/features/planner/new-deadline-button";
import { ReadinessBar, readinessLine } from "@/features/planner/readiness-bar";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { countdownLabel, KIND_LABELS } from "@/server/modules/planner/domain/exams";
import { plannerService } from "@/server/modules/planner/service";

export const metadata: Metadata = { title: "Exams" };

/**
 * Exams (Architecture §28): exam, test and assignment dates with a
 * countdown, and how ready the student feels for each.
 */
export default async function ExamsPage() {
  const { ctx } = await requirePageSession();
  const [{ today, upcoming, past }, subjects] = await Promise.all([
    plannerService.listDeadlines(ctx),
    knowledgeService.listSubjects(ctx),
  ]);
  const subjectOptions = subjects.map((s) => ({ id: s.id, name: s.name }));
  const empty = upcoming.length === 0 && past.length === 0;

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Exams"
        description="Your exam dates, and how ready you feel for each one."
        actions={!empty && <NewDeadlineButton subjects={subjectOptions} />}
      />

      <div className="mt-8 grid gap-8">
        {empty ? (
          <EmptyState
            icon={<CalendarClock />}
            title="No exams yet"
            description="Add your exam dates to get a countdown on Today and a checklist of topics to revise."
            action={<NewDeadlineButton subjects={subjectOptions} />}
          />
        ) : upcoming.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Nothing coming up. Add your next exam when you know the date.
          </p>
        ) : (
          <ul className="grid gap-3" aria-label="Coming up">
            {upcoming.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/exams/${d.id}`}
                  className="bg-card hover:bg-accent/50 focus-visible:ring-ring/50 flex flex-col gap-4 rounded-xl border p-4 outline-none focus-visible:ring-[3px] sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <CountdownTile days={d.days} className="size-20" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{d.title}</h2>
                        {d.kind !== "exam" && <Badge variant="secondary">{KIND_LABELS[d.kind]}</Badge>}
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {formatDue(d.dueOn, today, d.startsAt)}
                        <span className="sr-only">, {countdownLabel(d.days)}</span>
                      </p>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        {d.subject && (
                          <span className="flex items-center gap-1.5">
                            <SubjectDot colour={d.subject.colour} />
                            {d.subject.name}
                          </span>
                        )}
                        {d.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {d.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {d.readiness.total > 0 && (
                    <div className="grid gap-1.5 sm:w-48">
                      <ReadinessBar readiness={d.readiness} />
                      <p className="text-muted-foreground text-xs">{readinessLine(d.readiness)}</p>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Past</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="-mx-2 grid">
                {past.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/exams/${d.id}`}
                      className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      {d.subject ? <SubjectDot colour={d.subject.colour} /> : <span className="size-2.5" />}
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <span className="text-muted-foreground">{formatDue(d.dueOn, today)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
