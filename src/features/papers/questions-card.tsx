"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListPlus, Pencil, Plus, Tags, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { setPaperQuestions } from "@/server/actions/exams";
import { nextQuestionNumber, PAPER_LIMITS } from "@/server/modules/exams/domain/papers";

export type QuestionItem = { id: string; number: string; marks: number; topicIds: string[] };

type Row = { key: string; id?: string; number: string; marks: string; topicIds: string[] };

let nextKey = 0;
const key = () => `row-${nextKey++}`;

const toRows = (questions: QuestionItem[]): Row[] =>
  questions.map((q) => ({ key: key(), id: q.id, number: q.number, marks: String(q.marks), topicIds: q.topicIds }));

/** Why a row can't be saved, or null. */
function rowError(row: Row): string | null {
  if (row.number.trim() === "") return "Number it";
  const marks = Number(row.marks);
  if (row.marks.trim() === "" || !Number.isInteger(marks) || marks < 1) return "Give it at least 1 mark";
  if (marks > PAPER_LIMITS.questionMarks) return `Up to ${PAPER_LIMITS.questionMarks} marks`;
  return null;
}

/**
 * A paper's questions with their marks and topics, and the marks from the
 * latest attempt. "Edit questions" turns the table into a form.
 */
export function QuestionsCard({
  paperId,
  groups,
  questions,
  latest,
  hasAttempts,
}: {
  paperId: string;
  groups: TopicGroup[];
  questions: QuestionItem[];
  /** The latest attempt's marks per question, and when it was. */
  latest: { label: string; marks: Record<string, number> } | null;
  hasAttempts: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const topicName = new Map(groups.flatMap((g) => g.topics.map((t) => [t.id, t.name])));
  const hasTopics = topicName.size > 0;
  const total = questions.reduce((sum, q) => sum + q.marks, 0);

  function edit() {
    setRows(questions.length > 0 ? toRows(questions) : [{ key: key(), number: "1", marks: "", topicIds: [] }]);
    setShowErrors(false);
  }

  function update(rowKey: string, patch: Partial<Row>) {
    setRows((prev) => prev && prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
  }

  function add() {
    setRows((prev) => {
      const list = prev ?? [];
      const last = list.at(-1);
      return [...list, { key: key(), number: nextQuestionNumber(last?.number), marks: "", topicIds: [] }];
    });
  }

  async function save() {
    if (!rows) return;
    if (rows.some((r) => rowError(r) !== null)) {
      setShowErrors(true);
      return;
    }
    const result = await run(
      () =>
        setPaperQuestions({
          paperId,
          questions: rows.map((r) => ({
            id: r.id,
            number: r.number.trim(),
            marks: Number(r.marks),
            topicIds: r.topicIds,
          })),
        }),
      { success: "Questions saved" },
    );
    if (!result) return;
    setRows(null);
    router.refresh();
  }

  const removed = rows ? questions.filter((q) => !rows.some((r) => r.id === q.id)).length : 0;
  const editTotal = rows?.reduce((sum, r) => sum + (Number(r.marks) || 0), 0) ?? 0;
  const pickingRow = rows?.find((r) => r.key === picking) ?? null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>
            <h2>Questions</h2>
          </CardTitle>
          <CardDescription>
            {rows
              ? "Use the numbers on the paper. Tag each question with the topics it tests."
              : questions.length > 0
                ? `${questions.length} question${questions.length === 1 ? "" : "s"}, ${total} marks.`
                : "Enter the questions with their marks and topics to see where your marks come from."}
          </CardDescription>
        </div>
        {!rows && (
          <Button variant="outline" onClick={edit}>
            {questions.length > 0 ? <Pencil aria-hidden /> : <ListPlus aria-hidden />}
            {questions.length > 0 ? "Edit questions" : "Enter questions"}
          </Button>
        )}
      </CardHeader>

      {!rows && questions.length > 0 && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Question
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Topics
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Marks
                  </th>
                  {latest && (
                    <th scope="col" className="py-2 text-right font-medium">
                      {latest.label}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {questions.map((q) => {
                  const got = latest?.marks[q.id];
                  return (
                    <tr key={q.id}>
                      <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap">
                        {q.number}
                      </th>
                      <td className="py-2 pr-3">
                        {q.topicIds.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {q.topicIds.map((id) => (
                              <Badge key={id} variant="outline">
                                {topicName.get(id) ?? "Topic"}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No topic</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{q.marks}</td>
                      {latest && (
                        <td
                          className={cn(
                            "py-2 text-right tabular-nums",
                            got !== undefined && got < q.marks && "text-destructive font-medium",
                          )}
                        >
                          {got === undefined ? "–" : got}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}

      {rows && (
        <CardContent className="grid gap-4">
          {!hasTopics && (
            <p className="text-muted-foreground text-sm">
              This subject has no topics yet. Add them on its Structure tab to tag questions with them.
            </p>
          )}
          <div
            aria-hidden
            className="text-muted-foreground -mb-2 hidden grid-cols-[5rem_6rem_1fr_auto] gap-2 text-xs font-medium sm:grid"
          >
            <span>Number</span>
            <span>Marks</span>
            {hasTopics && <span>Topics</span>}
          </div>
          <ol aria-label="Questions" className="grid gap-3 sm:gap-2">
            {rows.map((row, index) => {
              const error = showErrors ? rowError(row) : null;
              const label = row.number.trim() || String(index + 1);
              return (
                <li key={row.key} className="grid gap-1">
                  <div className="grid grid-cols-[5rem_6rem_1fr_auto] items-center gap-2">
                    <Input
                      aria-label={`Question ${index + 1} number`}
                      value={row.number}
                      maxLength={PAPER_LIMITS.questionNumber}
                      onChange={(e) => update(row.key, { number: e.target.value })}
                      aria-invalid={error === "Number it" || undefined}
                    />
                    <Input
                      aria-label={`Marks for question ${label}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={PAPER_LIMITS.questionMarks}
                      placeholder="Marks"
                      value={row.marks}
                      onChange={(e) => update(row.key, { marks: e.target.value })}
                      aria-invalid={(error !== null && error !== "Number it") || undefined}
                    />
                    {hasTopics && (
                      <Button
                        type="button"
                        variant="outline"
                        className="order-last col-span-4 min-w-0 justify-start sm:order-none sm:col-span-1"
                        onClick={() => setPicking(row.key)}
                        aria-label={`Topics for question ${label}`}
                      >
                        <Tags aria-hidden />
                        <span className="truncate">
                          {row.topicIds.length > 0
                            ? row.topicIds.map((id) => topicName.get(id) ?? "Topic").join(", ")
                            : "Choose topics"}
                        </span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="col-start-4 sm:col-start-auto"
                      aria-label={`Remove question ${label}`}
                      onClick={() => setRows((prev) => prev && prev.filter((r) => r.key !== row.key))}
                    >
                      <X />
                    </Button>
                  </div>
                  {error && <p className="text-destructive text-sm">{error}</p>}
                </li>
              );
            })}
          </ol>
          <div>
            <Button type="button" variant="outline" onClick={add} disabled={rows.length >= PAPER_LIMITS.questions}>
              <Plus aria-hidden />
              Add a question
            </Button>
          </div>
          {removed > 0 && hasAttempts && (
            <p className="text-muted-foreground text-sm">
              Removing a question also removes the marks you logged for it. Your scores on the day stay as they were.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-sm tabular-nums">
              {rows.length} question{rows.length === 1 ? "" : "s"}, {editTotal} marks
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setRows(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={save} loading={pending}>
                Save questions
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      <QuestionTopicsDialog
        open={pickingRow !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        label={pickingRow ? pickingRow.number.trim() || "this question" : ""}
        groups={groups}
        selected={pickingRow?.topicIds ?? []}
        onSave={(topicIds) => {
          if (pickingRow) update(pickingRow.key, { topicIds });
          setPicking(null);
        }}
      />
    </Card>
  );
}

function QuestionTopicsDialog({
  open,
  onOpenChange,
  label,
  groups,
  selected,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  groups: TopicGroup[];
  selected: string[];
  onSave: (topicIds: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Keyed so each question starts from its own topics. */}
        {open && <TopicChecklist key={label} label={label} groups={groups} selected={selected} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function TopicChecklist({
  label,
  groups,
  selected,
  onSave,
}: {
  label: string;
  groups: TopicGroup[];
  selected: string[];
  onSave: (topicIds: string[]) => void;
}) {
  const [picked, setPicked] = useState(() => new Set(selected));
  const order = groups.flatMap((g) => g.topics.map((t) => t.id));
  const full = picked.size >= PAPER_LIMITS.topicsPerQuestion;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Topics in question {label}</DialogTitle>
        <DialogDescription>Pick every topic the question tests. Its marks are shared between them.</DialogDescription>
      </DialogHeader>
      <div className="-mx-1 grid gap-4 overflow-y-auto px-1">
        {groups
          .filter((g) => g.topics.length > 0)
          .map((g) => (
            <fieldset key={g.label} className="grid gap-1">
              <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                {g.label}
              </legend>
              {g.topics.map((t) => (
                <label key={t.id} className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.has(t.id)}
                    disabled={full && !picked.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-primary size-4"
                  />
                  {t.name}
                </label>
              ))}
            </fieldset>
          ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onSave(selected)}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSave(order.filter((id) => picked.has(id)))}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
