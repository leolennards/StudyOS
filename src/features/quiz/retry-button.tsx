"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/features/knowledge/use-action";
import { startQuiz } from "@/server/actions/assessment";
import type { QuizFormat } from "@/server/modules/assessment/domain/quiz";

/** Starts a new quiz from the questions missed in this one. */
export function RetryButton({ attemptId, missed, format }: { attemptId: string; missed: number; format: QuizFormat }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button
      loading={pending}
      onClick={async () => {
        const result = await run(() => startQuiz({ retryOf: attemptId, count: missed, format }));
        if (result) router.push(`/quiz/${result.id}`);
      }}
    >
      {!pending && <RotateCcw aria-hidden />}
      Retry the {missed === 1 ? "one" : missed} you missed
    </Button>
  );
}
