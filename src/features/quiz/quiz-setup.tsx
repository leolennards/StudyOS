"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play } from "lucide-react";
import { ChoiceGroup } from "@/components/shared/choice-group";
import { Button } from "@/components/ui/button";
import { useAction } from "@/features/knowledge/use-action";
import { selectClass } from "@/features/planner/deadline-form-dialog";
import { startQuiz } from "@/server/actions/assessment";
import {
  QUIZ_FORMAT_LABELS,
  QUIZ_FORMATS,
  QUIZ_LENGTHS,
  type QuizFormat,
} from "@/server/modules/assessment/domain/quiz";

/** A place a quiz can be drawn from. `value` is "", "subject:<id>", "topic:<id>" or "exam:<id>". */
export type QuizSource = { value: string; label: string; group: "subject" | "exam" | "topic" };

function toInput(value: string) {
  const [kind, id] = value.split(":");
  if (kind === "subject") return { subjectId: id };
  if (kind === "topic") return { topicId: id };
  if (kind === "exam") return { deadlineId: id };
  return {};
}

/** Chooses what to quiz on, how many questions and how to answer them, then starts the quiz. */
export function QuizSetup({ sources, defaultSource }: { sources: QuizSource[]; defaultSource: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [source, setSource] = useState(defaultSource);
  const [count, setCount] = useState<number>(QUIZ_LENGTHS[0]);
  const [format, setFormat] = useState<QuizFormat>("mixed");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const result = await run(() => startQuiz({ ...toInput(source), count, format }));
    if (result) router.push(`/quiz/${result.id}`);
  }

  const groups = [
    { key: "topic", label: "Topic" },
    { key: "exam", label: "Upcoming exams" },
    { key: "subject", label: "Subjects" },
  ] as const;

  return (
    <form onSubmit={start} className="grid gap-6">
      <div className="grid gap-2">
        <label htmlFor="quiz-source" className="text-sm font-medium">
          Quiz me on
        </label>
        <select id="quiz-source" className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All subjects</option>
          {groups.map((g) => {
            const options = sources.filter((s) => s.group === g.key);
            if (options.length === 0) return null;
            return (
              <optgroup key={g.key} label={g.label}>
                {options.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      <ChoiceGroup
        legend="Questions"
        name="quiz-count"
        value={String(count)}
        onChange={(v) => setCount(Number(v))}
        options={QUIZ_LENGTHS.map((n) => ({ value: String(n), label: String(n) }))}
      />
      <ChoiceGroup
        legend="Answer by"
        name="quiz-format"
        value={format}
        onChange={(v) => setFormat(v as QuizFormat)}
        options={QUIZ_FORMATS.map((f) => ({ value: f, label: QUIZ_FORMAT_LABELS[f] }))}
      />

      <div>
        <Button type="submit" size="lg" loading={pending}>
          {!pending && <Play aria-hidden />}
          Start quiz
        </Button>
      </div>
    </form>
  );
}
