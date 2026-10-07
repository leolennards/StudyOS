import Link from "next/link";
import { CircleHelp, GalleryVerticalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashcardsPanel } from "@/features/flashcards/flashcards-panel";
import { TopicFilter } from "@/features/flashcards/topic-filter";
import { topicGroups } from "@/features/knowledge/topic-groups";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { formatInterval } from "@/server/modules/flashcards/domain/scheduler";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A subject's flashcards, optionally narrowed to one topic with `?topic=`.
 * `?card=` opens a card for editing (search results link here). The layout
 * has already checked the subject exists.
 */
export default async function SubjectFlashcardsPage({
  params,
  searchParams,
}: PageProps<"/subjects/[subjectId]/flashcards">) {
  const { subjectId } = await params;
  const { topic, card } = await searchParams;
  const { ctx } = await requirePageSession();
  const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
  const groups = topicGroups(tree.sections, tree.unsectioned);
  const topicIds = new Set(groups.flatMap((g) => g.topics.map((t) => t.id)));
  const topicId = typeof topic === "string" && isUuid(topic) && topicIds.has(topic) ? topic : undefined;
  const scope = { subjectId, topicId };
  const openCardId = typeof card === "string" && isUuid(card) ? card : null;

  const now = new Date();
  const [{ cards, truncated }, overview] = await Promise.all([
    flashcardsService.listCards(ctx, scope, now),
    flashcardsService.getOverview(ctx, scope, now),
  ]);
  const waiting = overview.due + overview.new;
  const reviewHref = `/review?subject=${subjectId}${topicId ? `&topic=${topicId}` : ""}`;
  const quizHref = topicId ? `/quiz?topic=${topicId}` : `/quiz?subject=${subjectId}`;

  return (
    <div className="grid gap-6">
      {(cards.length > 0 || topicId) && (
        <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {waiting > 0
                ? `${plural(overview.due, "card")} due, ${overview.new} new`
                : overview.total > 0
                  ? "You're up to date"
                  : "Nothing to review yet"}
            </p>
            <p className="text-muted-foreground text-sm">
              {waiting === 0 && overview.nextDue
                ? `The next card is due in ${formatInterval(now, overview.nextDue)}.`
                : overview.newHeldBack > 0
                  ? `${plural(overview.newHeldBack, "more new card")} will be introduced on later days, as set in Settings.`
                  : "Reviews are scheduled with FSRS spaced repetition."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TopicFilter groups={groups} value={topicId ?? null} />
            {cards.length > 0 && (
              <Button asChild variant={waiting > 0 ? "outline" : "default"}>
                <Link href={quizHref}>
                  <CircleHelp aria-hidden />
                  Quiz
                </Link>
              </Button>
            )}
            {waiting > 0 && (
              <Button asChild>
                <Link href={reviewHref}>
                  <GalleryVerticalEnd aria-hidden />
                  Review
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <FlashcardsPanel
        // A different topic filter is a different list, and a search result opens its card: start the panel again.
        key={`${topicId ?? "all"}-${openCardId ?? ""}`}
        subjectId={subjectId}
        groups={groups}
        openCardId={openCardId}
        emptyBecauseOfFilter={cards.length === 0 && topicId !== undefined}
        cards={cards.map((c) => ({
          id: c.id,
          type: c.type,
          front: c.front,
          back: c.back,
          preview: c.preview,
          suspended: c.suspended,
          topics: c.topics,
          status: c.isNew
            ? "New"
            : c.nextDue && c.nextDue <= now
              ? "Due now"
              : `Due in ${formatInterval(now, c.nextDue ?? now)}`,
          due: !c.isNew && c.nextDue !== null && c.nextDue <= now,
          memory: (() => {
            const known = c.items.map((i) => i.retrievability).filter((r): r is number => r !== null);
            return known.length > 0 ? Math.round((Math.min(...known) || 0) * 100) : null;
          })(),
          itemCount: c.items.length,
          source:
            c.source?.kind === "note"
              ? { kind: "note", href: `/subjects/${subjectId}/notes/${c.source.id}`, title: c.source.title }
              : c.source?.kind === "document"
                ? {
                    kind: "document",
                    href: `/subjects/${subjectId}/documents/${c.source.id}${c.source.page ? `?page=${c.source.page}` : ""}`,
                    title: c.source.page ? `${c.source.title}, p. ${c.source.page}` : c.source.title,
                  }
                : null,
        }))}
      />

      {truncated && (
        <p className="text-muted-foreground text-sm">
          Showing the newest {cards.length} cards. Narrow the list by topic to see the rest.
        </p>
      )}
    </div>
  );
}
