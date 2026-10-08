"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, FileUp, Layers, MoreHorizontal, NotebookPen, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { deleteCard, setCardSuspended } from "@/server/actions/flashcards";
import { CARD_TYPE_LABELS, type CardType } from "@/server/modules/flashcards/domain/items";
import { CardDialog, type CardDialogState } from "./card-dialog";
import type { OcclusionBox } from "@/server/modules/flashcards/domain/occlusion";
import { CardPicture } from "./card-picture";
import { CardText } from "./card-text";

export type CardListItem = {
  id: string;
  type: CardType;
  front: string;
  back: string;
  frontImageId: string | null;
  backImageId: string | null;
  occlusions: OcclusionBox[] | null;
  preview: string;
  suspended: boolean;
  topics: { id: string; name: string }[];
  /** "New", "Due now", "Due in 3d": worked out on the server, so it matches what Review will show. */
  status: string;
  due: boolean;
  /** FSRS's estimate of recall now, as a whole percentage, or null for a card never reviewed. */
  memory: number | null;
  itemCount: number;
  source: { kind: "note"; href: string; title: string } | { kind: "document"; href: string; title: string } | null;
};

/** A subject's flashcards: add, edit, suspend and delete them. Review happens on the Review page. */
export function FlashcardsPanel({
  subjectId,
  groups,
  cards,
  openCardId,
  emptyBecauseOfFilter,
}: {
  subjectId: string;
  groups: TopicGroup[];
  cards: CardListItem[];
  openCardId: string | null;
  emptyBecauseOfFilter: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<CardDialogState | null>(() => {
    const card = openCardId ? cards.find((c) => c.id === openCardId) : null;
    return card ? editState(card) : null;
  });
  const topicFilter = searchParams.get("topic");

  function close() {
    setDialog(null);
    // Opened from search with ?card=…; drop it so a refresh doesn't reopen the dialog.
    if (searchParams.has("card")) {
      const params = new URLSearchParams(searchParams);
      params.delete("card");
      router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, { scroll: false });
    }
  }

  const importHref = `/subjects/${subjectId}/flashcards/import`;
  const newCard = () => setDialog({ mode: "create", draft: { topicIds: topicFilter ? [topicFilter] : [] } });

  return (
    <>
      {cards.length === 0 ? (
        emptyBecauseOfFilter ? (
          <EmptyState
            icon={<Layers />}
            title="No cards on this topic"
            description="Add one, or choose another topic."
            action={
              <Button onClick={newCard}>
                <Plus aria-hidden />
                New card
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Layers />}
            title="No flashcards yet"
            description="Write cards for what you need to remember, or bring in the ones you have from Anki, Quizlet or a spreadsheet. StudyOS schedules each one with spaced repetition, so you review it just before you'd forget it."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={newCard}>
                  <Plus aria-hidden />
                  New card
                </Button>
                <Button asChild variant="outline">
                  <Link href={importHref}>
                    <FileUp aria-hidden />
                    Import cards
                  </Link>
                </Button>
              </div>
            }
          />
        )
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={newCard}>
              <Plus aria-hidden />
              New card
            </Button>
            <Button asChild variant="outline">
              <Link href={importHref}>
                <FileUp aria-hidden />
                Import
              </Link>
            </Button>
          </div>
          <ul aria-label="Flashcards" className="bg-card divide-y overflow-hidden rounded-xl border">
            {cards.map((card) => (
              <CardRow key={card.id} card={card} onEdit={() => setDialog(editState(card))} />
            ))}
          </ul>
        </div>
      )}
      <CardDialog subjectId={subjectId} groups={groups} state={dialog} onClose={close} />
    </>
  );
}

const editState = (card: CardListItem): CardDialogState => ({
  mode: "edit",
  card: {
    id: card.id,
    type: card.type,
    front: card.front,
    back: card.back,
    frontImageId: card.frontImageId,
    backImageId: card.backImageId,
    occlusions: card.occlusions,
    topicIds: card.topics.map((t) => t.id),
  },
});

function CardRow({ card, onEdit }: { card: CardListItem; onEdit: () => void }) {
  return (
    <li className={cn("flex items-start gap-3 p-3 sm:p-4", card.suspended && "opacity-60")}>
      {card.frontImageId && (
        <CardPicture imageId={card.frontImageId} alt="" className="mx-0 size-14 shrink-0 object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="hover:text-primary focus-visible:ring-ring/50 line-clamp-2 rounded-sm text-left font-medium outline-none focus-visible:ring-[3px]"
          aria-label={`Edit card: ${card.preview.slice(0, 80)}`}
        >
          <CardText
            text={card.type === "basic" || card.type === "reverse" ? card.front || card.preview : card.preview}
          />
        </button>
        {(card.type === "basic" || card.type === "reverse") && (card.back || card.backImageId) && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
            {card.back ? <CardText text={card.back} /> : "Picture"}
          </p>
        )}
        <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className={cn(card.due && !card.suspended && "text-primary font-medium")}>
            {card.suspended ? "Suspended" : card.status}
          </span>
          {card.memory !== null && !card.suspended && (
            <>
              <span aria-hidden>·</span>
              <span title="How likely you are to remember it now, by the spaced-repetition model">
                Memory {card.memory}%
              </span>
            </>
          )}
          {card.type !== "basic" && (
            <>
              <span aria-hidden>·</span>
              <span>
                {CARD_TYPE_LABELS[card.type]}
                {(card.type === "cloze" || card.type === "image_occlusion") && card.itemCount > 1
                  ? ` (${card.itemCount})`
                  : ""}
              </span>
            </>
          )}
          {card.source && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={card.source.href}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                {card.source.kind === "note" ? (
                  <NotebookPen className="size-3" aria-hidden />
                ) : (
                  <FileText className="size-3" aria-hidden />
                )}
                <span className="max-w-48 truncate">{card.source.title}</span>
              </Link>
            </>
          )}
        </p>
        {card.topics.length > 0 && (
          <ul aria-label="Topics" className="mt-2 flex flex-wrap gap-1">
            {card.topics.map((t) => (
              <li key={t.id}>
                <Badge variant="outline">{t.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CardActions card={card} onEdit={onEdit} />
    </li>
  );
}

function CardActions({ card, onEdit }: { card: CardListItem; onEdit: () => void }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const label = card.preview.slice(0, 60);

  async function toggleSuspended() {
    const ok = await run(() => setCardSuspended({ id: card.id, suspended: !card.suspended }), {
      success: card.suspended ? "Card unsuspended" : "Card suspended",
    });
    if (ok) router.refresh();
  }

  const askDelete = () =>
    setConfirm({
      title: "Delete this card?",
      description:
        "The card and its review history will be deleted for good. To stop reviewing it but keep it, suspend it instead.",
      confirmLabel: "Delete card",
      onConfirm: async () => {
        const ok = await run(() => deleteCard({ id: card.id }), { success: "Card deleted" });
        if (ok) router.refresh();
      },
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleSuspended}>
            {card.suspended ? <Play aria-hidden /> : <Pause aria-hidden />}
            {card.suspended ? "Unsuspend" : "Suspend"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={askDelete}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
