"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardText, ItemAnswer, ItemQuestion } from "@/features/flashcards/card-text";
import { cn } from "@/lib/utils";
import { answerQuestion, finishQuiz, overrideAnswer } from "@/server/actions/assessment";
import { markAnswer, type QuestionKind, type QuizAnswer } from "@/server/modules/assessment/domain/quiz";
import type { CardType } from "@/server/modules/flashcards/domain/items";
import { itemFaces } from "@/server/modules/flashcards/domain/items";

export type RunnerQuestion = {
  position: number;
  kind: QuestionKind;
  type: CardType;
  ordinal: number;
  front: string;
  back: string;
  expected: string;
  options: string[] | null;
  answer: Mark | null;
};

type Mark = { given: string; correct: boolean; close: boolean; overridden: boolean };

/**
 * A quiz in progress (ADR-017): one question at a time, marked as soon as it
 * is answered so the student sees the right answer straight away. Answers
 * are saved in the background, in order, and retried if the connection
 * drops. Keyboard: 1 to 4 pick an option, Enter checks or moves on.
 */
export function QuizRunner({
  attemptId,
  questions,
  exitHref,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  exitHref: string;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<number, Mark>>(() =>
    Object.fromEntries(questions.filter((q) => q.answer).map((q) => [q.position, q.answer!])),
  );
  const [index, setIndex] = useState(() => {
    const i = questions.findIndex((q) => !q.answer);
    return i === -1 ? questions.length - 1 : i;
  });
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState(false);
  const [unsaved, setUnsaved] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const shownAt = useRef(0);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const nextButton = useRef<HTMLButtonElement>(null);

  const question = questions[index]!;
  const mark = marks[question.position] ?? null;
  const faces = itemFaces(question, question.ordinal);
  const answeredCount = Object.keys(marks).length;
  const rightCount = Object.values(marks).filter((m) => m.correct).length;
  const last = index === questions.length - 1;

  // Time on the first question runs from when the quiz appears.
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (mark) nextButton.current?.focus();
  }, [mark]);

  const enqueue = useCallback((task: () => Promise<void>) => {
    saving.current = saving.current.then(task, task);
    return saving.current;
  }, []);

  /** Saves with retries; counts what couldn't be saved so the student knows. */
  const save = useCallback(
    (send: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>) =>
      enqueue(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await send();
            if (result.ok) return;
            if (result.error && result.error.code !== "INTERNAL") {
              toast.error(result.error.message);
              return;
            }
          } catch {
            // Offline or the request dropped; wait and try again.
          }
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
        setUnsaved((n) => n + 1);
      }),
    [enqueue],
  );

  function answer(a: QuizAnswer) {
    if (mark) return;
    const result = markAnswer(question, a);
    setMarks((m) => ({ ...m, [question.position]: { ...result, overridden: false } }));
    const durationMs = Math.max(0, Date.now() - shownAt.current);
    void save(() => answerQuestion({ attemptId, position: question.position, answer: a, durationMs }));
  }

  function wasRight() {
    setMarks((m) => ({ ...m, [question.position]: { ...m[question.position]!, correct: true, overridden: true } }));
    void save(() => overrideAnswer({ attemptId, position: question.position }));
  }

  const finish = useCallback(async () => {
    setFinishing(true);
    await saving.current;
    const result = await finishQuiz({ id: attemptId }).catch(() => null);
    if (!result || !result.ok) {
      setFinishing(false);
      toast.error(result?.ok === false ? result.error.message : "We couldn't reach StudyOS. Check your connection.");
      return;
    }
    router.refresh();
  }, [attemptId, router]);

  const next = useCallback(() => {
    if (last) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
    setTyped("");
    setShown(false);
    shownAt.current = Date.now();
  }, [last, finish]);

  // Keyboard: 1–4 choose an option; Enter moves on once a question is marked.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role=dialog]")) return;
      if (!mark && question.kind === "choice" && /^[1-4]$/.test(e.key)) {
        const option = Number(e.key) - 1;
        if (option < (question.options?.length ?? 0)) {
          e.preventDefault();
          answer({ kind: "choice", option });
        }
        return;
      }
      if (!mark && question.kind === "self" && !shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (unsaved > 0) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  return (
    <div className="grid gap-4">
      {unsaved > 0 && (
        <p role="alert" className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-sm">
          {unsaved === 1 ? "One answer" : `${unsaved} answers`} couldn&apos;t be saved. Check your connection.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="tabular-nums">
          <span className="font-medium">
            Question {index + 1} of {questions.length}
          </span>
          <span className="text-muted-foreground hidden sm:inline"> · {rightCount} right so far</span>
        </p>
        <div className="flex items-center gap-1">
          {answeredCount > 0 && !last && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void finish()}>
              Finish now
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
            <Link href={exitHref}>Leave</Link>
          </Button>
        </div>
      </div>
      <div
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={answeredCount}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      <section aria-label="Question" className="bg-card rounded-xl border p-6 shadow-xs sm:p-8">
        <div
          key={question.position}
          data-testid="quiz-question"
          className="animate-in fade-in slide-in-from-right-4 text-center text-xl leading-relaxed duration-300"
        >
          <ItemQuestion faces={faces} />
        </div>

        <div className="mt-6">
          {question.kind === "choice" && (
            <div role="group" aria-label="Options" className="grid gap-2 sm:grid-cols-2">
              {question.options!.map((option, i) => {
                const isRight = option === question.expected;
                const picked = mark?.given === option;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={mark !== null}
                    onClick={() => answer({ kind: "choice", option: i })}
                    className={cn(
                      "focus-visible:ring-ring/50 flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] disabled:cursor-default",
                      !mark && "hover:bg-accent",
                      mark &&
                        isRight &&
                        "border-emerald-500/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                      mark && picked && !isRight && "border-red-500/60 bg-red-500/10 text-red-800 dark:text-red-200",
                      mark && !picked && !isRight && "opacity-60",
                    )}
                  >
                    <span
                      className="text-muted-foreground grid size-6 shrink-0 place-items-center rounded border text-xs tabular-nums"
                      aria-hidden
                    >
                      {mark && isRight ? (
                        <Check className="size-3.5" />
                      ) : mark && picked ? (
                        <X className="size-3.5" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <CardText text={option} className="min-w-0" />
                  </button>
                );
              })}
            </div>
          )}

          {question.kind === "typed" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!mark) answer({ kind: "typed", text: typed });
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Input
                key={question.position}
                autoFocus={!mark}
                aria-label="Your answer"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={mark ? mark.given : typed}
                readOnly={mark !== null}
                onChange={(e) => setTyped(e.target.value)}
                className={cn(
                  "h-11 text-base",
                  mark?.correct && "border-emerald-500/60",
                  mark && !mark.correct && "border-red-500/60",
                )}
              />
              {!mark && (
                <Button type="submit" size="lg" disabled={typed.trim() === ""}>
                  Check
                </Button>
              )}
            </form>
          )}

          {question.kind === "self" && !mark && (
            <div className="grid gap-4">
              {shown ? (
                <>
                  <div
                    data-testid="quiz-answer"
                    className="bg-muted/50 rounded-lg px-4 py-3 text-center text-lg leading-relaxed"
                  >
                    <ItemAnswer faces={faces} />
                  </div>
                  <div role="group" aria-label="Did you get it right?" className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => answer({ kind: "self", correct: false })}>
                      <X aria-hidden />I got it wrong
                    </Button>
                    <Button variant="outline" onClick={() => answer({ kind: "self", correct: true })}>
                      <Check aria-hidden />I got it right
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-center text-sm">
                    Answer it in your head or on paper, then check.
                  </p>
                  <Button size="lg" className="w-full" onClick={() => setShown(true)}>
                    Show answer
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {mark && (
          <Feedback
            question={question}
            mark={mark}
            onWasRight={question.kind === "typed" && !mark.correct ? wasRight : undefined}
          />
        )}
      </section>

      {mark && (
        <div className="bg-background/90 sticky bottom-0 -mx-4 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button ref={nextButton} size="lg" className="w-full" onClick={next} loading={finishing}>
            {last ? "See results" : "Next question"}
            {!finishing && <ArrowRight aria-hidden />}
          </Button>
        </div>
      )}
    </div>
  );
}

function Feedback({ question, mark, onWasRight }: { question: RunnerQuestion; mark: Mark; onWasRight?: () => void }) {
  // Multiple choice already shows the right option in green.
  const showAnswer = question.kind !== "choice" && (!mark.correct || mark.close);
  return (
    <div
      role="status"
      className={cn(
        "animate-in fade-in mt-6 rounded-lg border px-4 py-3 text-sm",
        mark.correct
          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200"
          : "border-red-500/40 bg-red-500/5 text-red-800 dark:text-red-200",
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        {mark.correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
        {mark.correct
          ? mark.overridden
            ? "Counted as right"
            : mark.close
              ? "Right, but check the spelling"
              : "Right"
          : "Not quite"}
      </p>
      {showAnswer && (
        <p className="text-foreground mt-1">
          The answer is <CardText text={question.expected} className="font-semibold" />
        </p>
      )}
      {onWasRight && (
        <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={onWasRight}>
          I was right, count it
        </Button>
      )}
    </div>
  );
}
