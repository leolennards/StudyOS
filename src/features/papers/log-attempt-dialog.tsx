"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { useAction } from "@/features/knowledge/use-action";
import { logPaperAttempt } from "@/server/actions/exams";
import { percent, scoreShare } from "@/server/modules/exams/domain/papers";

type Question = { id: string; number: string; marks: number };

const whole = (v: string) => (v.trim() === "" ? null : Number(v));

/** Opens the dialog for logging a sitting of the paper. */
export function LogAttemptButton(props: {
  paperId: string;
  today: string;
  questions: Question[];
  totalMarks: number | null;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={props.variant ?? "default"} onClick={() => setOpen(true)}>
        <ClipboardCheck aria-hidden />
        Log an attempt
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)]">
          {open && <AttemptForm {...props} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AttemptForm({
  paperId,
  today,
  questions,
  totalMarks,
  onDone,
}: {
  paperId: string;
  today: string;
  questions: Question[];
  totalMarks: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [takenOn, setTakenOn] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [score, setScore] = useState("");
  const [outOf, setOutOf] = useState(totalMarks ? String(totalMarks) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const perQuestion = questions.length > 0;
  const total = questions.reduce((sum, q) => sum + q.marks, 0);
  const gained = questions.reduce((sum, q) => sum + (Number(marks[q.id]) || 0), 0);

  function check() {
    const found: Record<string, string> = {};
    if (!takenOn) found.takenOn = "Pick a date";
    else if (takenOn > today) found.takenOn = "That's in the future";
    const m = whole(minutes);
    if (m !== null && (!Number.isInteger(m) || m < 1)) found.minutes = "Use a whole number of minutes";
    if (perQuestion) {
      for (const q of questions) {
        const v = whole(marks[q.id] ?? "");
        if (v === null) found[q.id] = "Enter a mark, 0 if you didn't get any";
        else if (!Number.isInteger(v) || v < 0) found[q.id] = "Use a whole number";
        else if (v > q.marks) found[q.id] = `Out of ${q.marks}`;
      }
    } else {
      const o = whole(outOf);
      const s = whole(score);
      if (o === null || !Number.isInteger(o) || o < 1) found.outOf = "Enter what it was out of";
      if (s === null || !Number.isInteger(s) || s < 0) found.score = "Enter your score";
      else if (o !== null && s > o) found.score = `That's more than ${o}`;
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check()) return;
    const result = await run(
      () =>
        logPaperAttempt({
          paperId,
          takenOn,
          minutes: whole(minutes),
          marks: perQuestion ? questions.map((q) => ({ questionId: q.id, awarded: Number(marks[q.id]) })) : [],
          score: perQuestion ? undefined : Number(score),
          outOf: perQuestion ? undefined : Number(outOf),
        }),
      {
        onError: (r) => {
          const fields = Object.fromEntries(
            Object.entries(r.error.fields ?? {}).flatMap(([k, v]) => (v?.[0] ? [[k, v[0]]] : [])),
          );
          setErrors(Object.keys(fields).length > 0 ? fields : { root: r.error.message });
        },
      },
    );
    if (!result) return;
    toast.success(`Saved: ${result.score} out of ${result.outOf} (${percent(scoreShare(result.score, result.outOf))})`);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Log an attempt</DialogTitle>
        <DialogDescription>
          {perQuestion
            ? "Mark it with the mark scheme, then enter what you got on each question."
            : "Enter your score. Enter the questions on this paper to see your marks by topic."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="-mx-1 grid gap-4 overflow-y-auto px-1">
        {errors.root && (
          <p role="alert" className="text-destructive text-sm">
            {errors.root}
          </p>
        )}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField id="attempt-date" label="Date" error={errors.takenOn}>
            <Input type="date" max={today} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
          </FormField>
          <FormField id="attempt-minutes" label="Minutes taken" hint="Optional" error={errors.minutes}>
            <Input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </FormField>
        </div>
        {perQuestion ? (
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Marks</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {questions.map((q) => (
                <FormField key={q.id} id={`attempt-q-${q.id}`} label={`Question ${q.number}`} error={errors[q.id]}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={q.marks}
                    placeholder={`out of ${q.marks}`}
                    value={marks[q.id] ?? ""}
                    onChange={(e) => setMarks((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
            <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
              Total: {gained} out of {total} ({percent(scoreShare(gained, total))})
            </p>
          </fieldset>
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField id="attempt-score" label="Score" error={errors.score}>
              <Input type="number" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} />
            </FormField>
            <FormField id="attempt-out-of" label="Out of" error={errors.outOf}>
              <Input type="number" inputMode="numeric" value={outOf} onChange={(e) => setOutOf(e.target.value)} />
            </FormField>
          </div>
        )}
        <DialogFooter className="bg-background sticky bottom-0 pt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save attempt
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
