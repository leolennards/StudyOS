"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { cn } from "@/lib/utils";
import { loadReviewSession, reviewCard, undoReview } from "@/server/actions/flashcards";
import { itemFaces } from "@/server/modules/flashcards/domain/items";
import { comesBackThisSession, pickNext } from "@/server/modules/flashcards/domain/queue";
import {
  formatInterval,
  type MemoryState,
  previewDue,
  type Rating,
  RATINGS,
  schedule,
} from "@/server/modules/flashcards/domain/scheduler";
import type { ClientSession, SessionItem } from "@/server/modules/flashcards/types";
import { ItemAnswer, ItemQuestion } from "./card-text";

type Item = Omit<SessionItem, "memory"> & { memory: MemoryState };
type Queued = { key: string; item: Item; showAt: number };
type Snapshot = { queue: Queued[]; current: Queued | null; tally: Tally };
type Tally = Record<Rating, number>;

const emptyTally = (): Tally => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

const dueFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function toQueue(session: ClientSession): Queued[] {
  return session.items.map((i) => ({
    key: `${i.cardId}:${i.ordinal}`,
    item: {
      ...i,
      memory: {
        ...i.memory,
        due: new Date(i.memory.due),
        lastReview: i.memory.lastReview ? new Date(i.memory.lastReview) : null,
      },
    },
    showAt: 0,
  }));
}

/** Takes the next item off the queue. */
function take(queue: Queued[], now: number): { current: Queued | null; queue: Queued[] } {
  const i = pickNext(queue, now);
  if (i === -1) return { current: null, queue };
  return { current: queue[i]!, queue: queue.filter((_, j) => j !== i) };
}

const RATING_STYLES: Record<Rating, string> = {
  1: "border-red-500/40 hover:bg-red-500/10 text-red-700 dark:text-red-300",
  2: "border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  3: "border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  4: "border-sky-500/40 hover:bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

/**
 * A review session (Architecture §20): keyboard-first (Space to show the
 * answer, 1 to 4 to rate, Z to undo), and optimistic, so the next card
 * appears at once while the rating is saved in the background. The server
 * reschedules each item itself; this screen uses the same FSRS functions
 * only to label the buttons and to bring learning steps back in time.
 */
export function ReviewSession({
  initial,
  scope,
  subjects,
  doneHref,
}: {
  initial: ClientSession;
  scope: { subjectId?: string; topicId?: string };
  subjects: Record<string, { name: string; colour: string }>;
  doneHref: string;
}) {
  const router = useRouter();
  const [retention, setRetention] = useState(initial.retention);
  const [more, setMore] = useState(initial.more);
  const [nextDue, setNextDue] = useState(initial.nextDue);
  const [{ queue, current }, setState] = useState(() => take(toQueue(initial), Date.now()));
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<{ reviewId: string; before: Snapshot }[]>([]);
  const [unsaved, setUnsaved] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [spentMs, setSpentMs] = useState(0);
  const [previews, setPreviews] = useState<{ at: Date; due: Record<Rating, Date> } | null>(null);
  const shownAt = useRef(0);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  // Ratings are saved one after another, in order, so an item rated twice in
  // one session (a learning step) is always rescheduled from its latest state.
  const enqueue = useCallback((task: () => Promise<void>) => {
    saving.current = saving.current.then(task, task);
    return saving.current;
  }, []);

  // Time on each card runs from when it is shown until it is rated.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.key, current?.showAt]);

  const reveal = useCallback(() => {
    if (!current) return;
    const at = new Date();
    setPreviews({ at, due: previewDue(current.item.memory, at, { retention }) });
    setRevealed(true);
  }, [current, retention]);

  const reviewed = tally[1] + tally[2] + tally[3] + tally[4];
  const finished = current === null;

  // When the session ends, refresh what the rest of the app shows (the count beside Review) once the
  // last rating is saved. The session itself keeps its state: it is keyed by scope, not by its data.
  useEffect(() => {
    if (!finished || reviewed === 0) return;
    let cancelled = false;
    void saving.current.then(() => {
      if (!cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [finished, reviewed, router]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!current) return;
      const at = new Date();
      const next = schedule(current.item.memory, rating, at, { retention });
      const reviewId = crypto.randomUUID();
      const durationMs = Math.max(0, Date.now() - shownAt.current);
      const before: Snapshot = { queue, current, tally };
      const requeue = comesBackThisSession(next, at)
        ? [...queue, { ...current, item: { ...current.item, memory: next }, showAt: next.due.getTime() }]
        : queue;
      setHistory((h) => [...h.slice(-49), { reviewId, before }]);
      setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
      setSpentMs((ms) => ms + Math.min(durationMs, 5 * 60_000));
      setState(take(requeue, at.getTime()));
      setRevealed(false);

      const input = {
        reviewId,
        cardId: current.item.cardId,
        ordinal: current.item.ordinal,
        rating,
        durationMs,
      };
      void enqueue(async () => {
        // The rating's id makes retries safe: the server records it once.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await reviewCard(input);
            if (result.ok) return;
            if (result.error.code !== "INTERNAL") {
              toast.error(result.error.message);
              return;
            }
          } catch {
            // Offline or the request dropped; wait and try again.
          }
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
        setUnsaved((n) => n + 1);
      });
    },
    [current, queue, tally, retention, enqueue],
  );

  const undo = useCallback(async () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setState({ queue: last.before.queue, current: last.before.current });
    setTally(last.before.tally);
    setRevealed(false);
    await enqueue(async () => {
      const result = await undoReview({ reviewId: last.reviewId }).catch(() => null);
      // NOT_FOUND: the rating never reached the server, so there is nothing to undo there.
      if (result && !result.ok && result.error.code !== "NOT_FOUND") toast.error(result.error.message);
    });
  }, [history, enqueue]);

  async function keepGoing() {
    setLoadingMore(true);
    await saving.current;
    const result = await loadReviewSession(scope).catch(() => null);
    setLoadingMore(false);
    if (!result || !result.ok) {
      toast.error(result?.ok === false ? result.error.message : "We couldn't reach StudyOS. Check your connection.");
      return;
    }
    setRetention(result.data.retention);
    setMore(result.data.more);
    setNextDue(result.data.nextDue);
    setHistory([]);
    setState(take(toQueue(result.data), Date.now()));
  }

  // Keyboard: Space or Enter shows the answer (then means Good), 1–4 rate, Z or ⌘Z/Ctrl+Z undoes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.altKey) return;
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
        if (history.length === 0) return;
        e.preventDefault();
        void undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || !current) return;
      if (e.key === " " || e.key === "Enter") {
        // Let Enter activate a focused button; Space always flips or rates.
        if (e.key === "Enter" && target?.closest("button, a")) return;
        e.preventDefault();
        if (revealed) rate(3);
        else reveal();
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key) as Rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, rate, reveal, undo, history.length]);

  // Warn before leaving while ratings are still being saved.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (unsaved > 0) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  const remaining = useMemo(() => {
    const all = current ? [current, ...queue] : queue;
    const unique = new Map(all.map((q) => [q.key, q.item.memory.state]));
    let fresh = 0;
    let learning = 0;
    let review = 0;
    for (const state of unique.values()) {
      if (state === "new") fresh++;
      else if (state === "review") review++;
      else learning++;
    }
    return { fresh, learning, review };
  }, [current, queue]);

  const faces = current ? itemFaces(current.item, current.item.ordinal) : null;

  const undoButton = history.length > 0 && (
    <Button variant="ghost" size="sm" onClick={() => void undo()} className="text-muted-foreground">
      <Undo2 aria-hidden />
      Undo
    </Button>
  );

  const unsavedAlert = unsaved > 0 && (
    <p role="alert" className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-sm">
      {unsaved === 1 ? "One rating" : `${unsaved} ratings`} couldn&apos;t be saved. Check your connection; those cards
      will be shown again next time.
    </p>
  );

  if (!current || !faces) {
    const minutes = Math.max(1, Math.round(spentMs / 60_000));
    return (
      <div className="grid gap-4">
        {unsavedAlert}
        <section
          aria-labelledby="session-done"
          className="bg-card flex flex-col items-center rounded-xl border px-6 py-10 text-center"
        >
          <div className="bg-success/10 text-success mb-4 grid size-12 place-items-center rounded-xl" aria-hidden>
            <CircleCheck className="size-6" />
          </div>
          <h2 id="session-done" className="text-lg font-semibold">
            {reviewed > 0 ? "Session complete" : "Nothing to review right now"}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {reviewed > 0
              ? `You reviewed ${reviewed} ${reviewed === 1 ? "card" : "cards"} in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
              : "You're up to date."}{" "}
            {!more && nextDue && `The next card is due ${dueFormat.format(new Date(nextDue))}.`}
          </p>
          {reviewed > 0 && (
            <dl className="mt-6 grid w-full max-w-sm grid-cols-4 gap-2 text-sm">
              {RATINGS.map((r) => (
                <div key={r.value} className={cn("rounded-lg border px-2 py-2", RATING_STYLES[r.value])}>
                  <dt className="text-xs">{r.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{tally[r.value]}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {undoButton}
            {more && (
              <Button onClick={keepGoing} loading={loadingMore}>
                {!loadingMore && <RotateCcw aria-hidden />}
                Keep going
              </Button>
            )}
            <Button variant={more ? "outline" : "default"} asChild>
              <Link href={doneHref}>Done</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const subject = subjects[current.item.subjectId];

  return (
    <div className="grid gap-4">
      {unsavedAlert}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-label="Cards left in this session" className="flex items-center gap-3 tabular-nums">
          <span className="text-sky-700 dark:text-sky-300" title="New">
            {remaining.fresh} new
          </span>
          <span className="text-red-700 dark:text-red-300" title="Learning">
            {remaining.learning} learning
          </span>
          <span className="text-emerald-700 dark:text-emerald-300" title="Review">
            {remaining.review} to review
          </span>
        </p>
        <div className="flex items-center gap-2">
          {undoButton}
          <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
            <Link href={doneHref}>End session</Link>
          </Button>
        </div>
      </div>

      <section
        aria-label="Card"
        aria-live="polite"
        className="bg-card flex min-h-72 flex-col rounded-xl border p-6 shadow-xs sm:min-h-80 sm:p-10"
      >
        {subject && !scope.subjectId && (
          <p className="text-muted-foreground mb-4 flex items-center gap-2 text-xs">
            <SubjectDot colour={subject.colour} />
            {subject.name}
          </p>
        )}
        <div data-testid="card-question" className="text-center text-xl leading-relaxed sm:text-2xl">
          {faces.kind === "cloze" && revealed ? <ItemAnswer faces={faces} /> : <ItemQuestion faces={faces} />}
        </div>
        {revealed && faces.kind === "plain" && (
          <>
            <hr className="my-6" />
            <div data-testid="card-answer" className="text-center text-xl leading-relaxed sm:text-2xl">
              <ItemAnswer faces={faces} />
            </div>
          </>
        )}
      </section>

      <div className="bg-background/90 sticky bottom-0 -mx-4 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {revealed ? (
          <div role="group" aria-label="How well did you remember it?" className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => rate(r.value)}
                className={cn(
                  "focus-visible:ring-ring/50 bg-card flex flex-col items-center rounded-lg border px-2 py-2.5 text-sm font-medium outline-none focus-visible:ring-[3px]",
                  RATING_STYLES[r.value],
                )}
              >
                <span>{r.label}</span>
                <span className="text-muted-foreground text-xs font-normal tabular-nums">
                  {previews ? formatInterval(previews.at, previews.due[r.value]) : ""}
                  <span className="hidden sm:inline"> · {r.key}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={reveal}>
            Show answer
            <kbd className="bg-primary-foreground/15 ml-2 hidden rounded px-1.5 font-sans text-xs sm:inline">Space</kbd>
          </Button>
        )}
      </div>
    </div>
  );
}
