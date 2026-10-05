import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, Circle, GalleryVerticalEnd } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewSubjectButton } from "@/features/knowledge/new-subject-button";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { cn } from "@/lib/utils";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { formatInterval } from "@/server/modules/flashcards/domain/scheduler";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { libraryService } from "@/server/modules/library/service";
import { settingsService } from "@/server/modules/settings/service";

export const metadata: Metadata = { title: "Today" };

function greeting(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const { user, ctx } = await requirePageSession();
  const now = new Date();
  const [subjects, settings, documentCount, review] = await Promise.all([
    knowledgeService.listSubjects(ctx),
    settingsService.get(ctx),
    libraryService.countDocuments(ctx),
    flashcardsService.getOverview(ctx, {}, now),
  ]);
  const firstName = user.name.split(/\s+/)[0];
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: settings.timezone,
  }).format(new Date());

  // Setup progress, computed from what is actually stored.
  const steps = [
    { label: "Add a subject you're studying", done: subjects.length > 0, href: "/subjects?new=1" },
    {
      label: "Map its sections (modules, chapters or weeks)",
      done: subjects.some((s) => s.sectionCount > 0),
      href: subjects[0] ? `/subjects/${subjects[0].id}` : "/subjects",
    },
    {
      label: "Add the topics you need to learn",
      done: subjects.some((s) => s.topicCount > 0),
      href: subjects[0] ? `/subjects/${subjects[0].id}` : "/subjects",
    },
    {
      label: "Upload a lecture, your notes or a past paper",
      done: documentCount > 0,
      href: subjects[0] ? `/subjects/${subjects[0].id}/documents` : "/subjects",
    },
    {
      label: "Write your first flashcards",
      done: review.total > 0,
      href: subjects[0] ? `/subjects/${subjects[0].id}/flashcards` : "/subjects",
    },
  ];
  const waiting = review.due + review.new;
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <PageContainer>
      <PageHeader title={`${greeting(settings.timezone)}, ${firstName}`} description={date} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your subjects</h2>
            </CardTitle>
            <CardDescription>Study recommendations will appear here once you start practising.</CardDescription>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-5">
                <p className="text-muted-foreground text-sm">
                  Add the courses you&apos;re taking this term to get started.
                </p>
                <NewSubjectButton />
              </div>
            ) : (
              <ul className="-mx-2 grid">
                {subjects.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/subjects/${s.id}`}
                      className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-3 rounded-md px-2 py-2.5 outline-none focus-visible:ring-[3px]"
                    >
                      <SubjectDot colour={s.colour} />
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {s.topicCount} topic{s.topicCount === 1 ? "" : "s"}
                      </span>
                      <ArrowRight className="text-muted-foreground size-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          {review.total > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Flashcards</h2>
                </CardTitle>
                <CardDescription>
                  {waiting > 0
                    ? `${review.due} due and ${review.new} new today`
                    : review.nextDue
                      ? `All done for now. The next card is due in ${formatInterval(now, review.nextDue)}.`
                      : "All done for today."}
                </CardDescription>
              </CardHeader>
              {waiting > 0 && (
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/review">
                      <GalleryVerticalEnd aria-hidden />
                      Start review
                    </Link>
                  </Button>
                </CardContent>
              )}
            </Card>
          )}

          {remaining > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Set up StudyOS</h2>
                </CardTitle>
                <CardDescription>
                  {steps.length - remaining} of {steps.length} done
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-1">
                  {steps.map((step) => (
                    <li key={step.label}>
                      <Link
                        href={step.href}
                        className={cn(
                          "hover:bg-accent focus-visible:ring-ring/50 flex items-start gap-3 rounded-md p-2 text-sm outline-none focus-visible:ring-[3px]",
                          step.done && "text-muted-foreground line-through",
                        )}
                      >
                        {step.done ? (
                          <Check className="text-success mt-0.5 size-4 shrink-0" aria-label="Done" />
                        ) : (
                          <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Not done" />
                        )}
                        {step.label}
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
