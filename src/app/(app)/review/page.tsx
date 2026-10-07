import Link from "next/link";
import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ReviewScopePicker } from "@/features/flashcards/review-scope-picker";
import { ReviewSession } from "@/features/flashcards/review-session";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { toClientSession } from "@/server/modules/flashcards/types";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { progressService } from "@/server/modules/progress/service";

export const metadata: Metadata = { title: "Review" };

/**
 * Review (Architecture §1): flashcards due across every subject, or one
 * subject (`?subject=`) or topic (`?topic=`). A deck is just this filter.
 */
export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { subject, topic } = await searchParams;
  const { ctx } = await requirePageSession();
  const subjects = await knowledgeService.listSubjects(ctx);

  const subjectId = typeof subject === "string" && subjects.some((s) => s.id === subject) ? subject : undefined;
  let topicId: string | undefined;
  let topicName: string | undefined;
  if (subjectId && typeof topic === "string" && isUuid(topic)) {
    const [found] = await knowledgeService.findTopics(ctx, [topic]);
    if (found && found.subjectId === subjectId) {
      topicId = found.id;
      topicName = found.name;
    }
  }
  const scope = { subjectId, topicId };

  const [session, counts, cardCount, habits] = await Promise.all([
    flashcardsService.getSession(ctx, scope),
    flashcardsService.getSubjectCounts(ctx),
    flashcardsService.countCards(ctx),
    progressService.getHabits(ctx),
  ]);
  const current = subjects.find((s) => s.id === subjectId);
  const doneHref = current ? `/subjects/${current.id}/flashcards${topicId ? `?topic=${topicId}` : ""}` : "/today";

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Review"
        description={
          current
            ? topicName
              ? `${current.name} · ${topicName}`
              : current.name
            : "Flashcards due across all your subjects"
        }
        actions={
          cardCount > 0 && (
            <ReviewScopePicker
              value={subjectId ?? ""}
              options={subjects.map((s) => {
                const c = counts.get(s.id);
                const waiting = (c?.due ?? 0) + (c?.new ?? 0);
                return { id: s.id, label: waiting > 0 ? `${s.name} (${waiting})` : s.name };
              })}
            />
          )
        }
      />
      <div className="mt-8">
        {cardCount === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="No flashcards yet"
            description="Add cards from a subject's Flashcards tab, or select text in a note and make a card from it. They'll appear here when they're due."
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
          <ReviewSession
            // A new scope is a new session.
            key={`${subjectId ?? "all"}-${topicId ?? "all"}`}
            initial={toClientSession(session)}
            scope={scope}
            subjects={Object.fromEntries(subjects.map((s) => [s.id, { name: s.name, colour: s.colour }]))}
            doneHref={doneHref}
            habits={{
              todaySeconds: habits.todaySeconds,
              goalMinutes: habits.goalMinutes,
              streak: habits.streak,
              studiedToday: habits.studiedToday,
            }}
          />
        )}
      </div>
    </PageContainer>
  );
}
