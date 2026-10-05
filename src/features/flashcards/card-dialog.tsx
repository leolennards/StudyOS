"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { createCard, updateCard } from "@/server/actions/flashcards";
import { clozeNumbers } from "@/server/modules/flashcards/domain/cloze";
import { CARD_TYPE_LABELS, cardProblem, type CardType, itemFaces } from "@/server/modules/flashcards/domain/items";
import { CARD_TEXT_MAX } from "@/server/modules/flashcards/domain/limits";
import { ItemAnswer, ItemQuestion } from "./card-text";

export type CardDraft = {
  type?: CardType;
  front?: string;
  back?: string;
  topicIds?: string[];
  sourceNoteId?: string | null;
  sourceDocumentId?: string | null;
  sourcePage?: number | null;
};

/** What the dialog is doing: adding a card (optionally pre-filled, say from a selection) or editing one. */
export type CardDialogState =
  | { mode: "create"; draft: CardDraft }
  | { mode: "edit"; card: { id: string; type: CardType; front: string; back: string; topicIds: string[] } };

type Props = {
  subjectId: string;
  groups: TopicGroup[];
  state: CardDialogState | null;
  onClose: () => void;
};

const TYPE_HINTS: Record<CardType, string> = {
  basic: "A question on the front, the answer on the back.",
  reverse: "Asked both ways: front to back, and back to front.",
  cloze: "Hide parts of a sentence. Each {{c1::…}} number is asked separately.",
};

/** Add or edit a flashcard, with a live preview of how it will be asked. */
export function CardDialog({ state, ...props }: Props) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {state && <CardForm key={state.mode === "edit" ? state.card.id : "new"} state={state} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({ subjectId, groups, state, onClose }: Omit<Props, "state"> & { state: CardDialogState }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const id = useId();
  const initial = state.mode === "edit" ? state.card : state.draft;
  const [type, setType] = useState<CardType>(initial.type ?? "basic");
  const [front, setFront] = useState(initial.front ?? "");
  const [back, setBack] = useState(initial.back ?? "");
  const [topicIds, setTopicIds] = useState(() => new Set(initial.topicIds ?? []));
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const hasTopics = groups.some((g) => g.topics.length > 0);
  const isCloze = type === "cloze";

  const problem = cardProblem({ type, front, back });
  const numbers = isCloze ? clozeNumbers(front) : [];
  const previewFaces = problem ? null : itemFaces({ type, front, back }, isCloze ? numbers[0]! : 0);

  const toggleTopic = (topicId: string, on: boolean) =>
    setTopicIds((s) => {
      const next = new Set(s);
      if (on) next.add(topicId);
      else next.delete(topicId);
      return next;
    });

  /** Wraps the selected text in the next cloze deletion, as Anki's Ctrl+Shift+C does. */
  function hideSelection() {
    const el = frontRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const n = (clozeNumbers(front).at(-1) ?? 0) + 1;
    const selected = front.slice(start, end) || "answer";
    const wrapped = `{{c${n}::${selected}}}`;
    setFront(front.slice(0, start) + wrapped + front.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const answerStart = start + `{{c${n}::`.length;
      el.setSelectionRange(answerStart, answerStart + selected.length);
    });
  }

  async function save(addAnother: boolean) {
    setError(null);
    if (problem) {
      setError(problem);
      return;
    }
    const fields = { type, front, back, topicIds: [...topicIds] };
    const result = await run(
      () =>
        state.mode === "edit"
          ? updateCard({ id: state.card.id, ...fields })
          : createCard({
              subjectId,
              ...fields,
              sourceNoteId: state.draft.sourceNoteId,
              sourceDocumentId: state.draft.sourceDocumentId,
              sourcePage: state.draft.sourcePage,
            }),
      { onError: (r) => setError(r.error.fields?.front?.[0] ?? r.error.message) },
    );
    if (!result) return;
    router.refresh();
    if (addAnother) {
      setAdded((n) => n + 1);
      setFront("");
      setBack("");
      frontRef.current?.focus();
    } else {
      onClose();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save(state.mode === "create");
    }
    if (isCloze && e.key.toLowerCase() === "c" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      hideSelection();
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{state.mode === "edit" ? "Edit card" : "New card"}</DialogTitle>
        <DialogDescription>
          Write maths in LaTeX between dollar signs: <code className="text-xs">$E = mc^2$</code>, or{" "}
          <code className="text-xs">$$…$$</code> for an equation on its own line.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div
          role="radiogroup"
          aria-label="Card type"
          className="bg-muted inline-flex w-fit flex-wrap gap-1 rounded-lg p-1"
        >
          {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "focus-visible:ring-ring/50 rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px]",
                type === t
                  ? "bg-background text-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CARD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">{TYPE_HINTS[type]}</p>
      </fieldset>

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor={`${id}-front`}>{isCloze ? "Text" : "Front"}</Label>
          {isCloze && (
            <Button type="button" variant="outline" size="sm" onClick={hideSelection}>
              <EyeOff aria-hidden />
              Hide selection
            </Button>
          )}
        </div>
        <Textarea
          id={`${id}-front`}
          ref={frontRef}
          autoFocus
          value={front}
          maxLength={CARD_TEXT_MAX}
          onChange={(e) => setFront(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : isCloze ? `${id}-cloze-hint` : undefined}
          placeholder={isCloze ? "The {{c1::mitochondria}} is the powerhouse of the cell." : "What is the question?"}
          className="min-h-24"
        />
        {isCloze && (
          <p id={`${id}-cloze-hint`} className="text-muted-foreground text-sm">
            Select words and press Hide selection (or Ctrl+Shift+C).{" "}
            {numbers.length > 0
              ? `This card will be asked ${numbers.length} ${numbers.length === 1 ? "way" : "ways"}.`
              : "Add a hint after a second ::, like {{c1::answer::hint}}."}
          </p>
        )}
      </div>

      <FormField id={`${id}-back`} label={isCloze ? "Extra (optional)" : "Back"}>
        <Textarea
          value={back}
          maxLength={CARD_TEXT_MAX}
          onChange={(e) => setBack(e.target.value)}
          placeholder={isCloze ? "Anything to show with the answer" : "And the answer?"}
          className="min-h-20"
        />
      </FormField>

      {hasTopics && (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">Topics</legend>
          <div className="grid max-h-36 gap-3 overflow-y-auto rounded-md border p-2">
            {groups
              .filter((g) => g.topics.length > 0)
              .map((group) => (
                <div key={group.label} className="grid gap-0.5">
                  <p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
                    {group.label}
                  </p>
                  {group.topics.map((t) => (
                    <label
                      key={t.id}
                      className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-4"
                        checked={topicIds.has(t.id)}
                        onChange={(e) => toggleTopic(t.id, e.target.checked)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </fieldset>
      )}

      {previewFaces && (
        <section aria-label="Preview" className="bg-muted/40 grid gap-3 rounded-lg border p-4 text-sm">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Preview{isCloze && numbers.length > 1 ? ` (c${numbers[0]} of ${numbers.length})` : ""}
          </p>
          <div className="text-base">
            <ItemQuestion faces={previewFaces} />
          </div>
          <hr />
          <div className="text-base">
            <ItemAnswer faces={previewFaces} />
          </div>
        </section>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter className="items-center">
        {added > 0 && (
          <p role="status" className="text-muted-foreground mr-auto text-sm">
            {added} {added === 1 ? "card" : "cards"} added
          </p>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {added > 0 ? "Done" : "Cancel"}
        </Button>
        {state.mode === "create" ? (
          <>
            <Button type="button" variant="outline" onClick={() => save(false)} disabled={pending}>
              Add and close
            </Button>
            <Button type="button" onClick={() => save(true)} loading={pending}>
              Add card
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => save(false)} loading={pending}>
            Save card
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
