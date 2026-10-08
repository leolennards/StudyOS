"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deletePaperAttempt } from "@/server/actions/exams";
import { percent } from "@/server/modules/exams/domain/papers";

export type AttemptItem = {
  id: string;
  date: string;
  score: number;
  outOf: number;
  share: number;
  minutes: number | null;
  best: boolean;
};

/** Every attempt at a paper, newest first, each with a bar for its score. */
export function AttemptsList({ attempts }: { attempts: AttemptItem[] }) {
  const router = useRouter();
  const { run } = useAction();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <>
      <ul aria-label="Attempts" className="divide-y">
        {attempts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{a.date}</span>
                <span className="tabular-nums">
                  {a.score} / {a.outOf}
                </span>
                <span className="text-muted-foreground tabular-nums">{percent(a.share)}</span>
                {a.minutes !== null && <span className="text-muted-foreground">{a.minutes} min</span>}
                {a.best && attempts.length > 1 && <span className="text-primary text-xs font-medium">Best</span>}
              </p>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                <div className="bg-primary h-full rounded-full" style={{ width: `${Math.round(a.share * 100)}%` }} />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete the attempt on ${a.date}`}
              onClick={() =>
                setConfirm({
                  title: `Delete the attempt on ${a.date}?`,
                  description: `Your ${a.score} out of ${a.outOf} and the marks for each question will be deleted.`,
                  confirmLabel: "Delete attempt",
                  onConfirm: async () => {
                    const ok = await run(() => deletePaperAttempt({ id: a.id }), { success: "Attempt deleted" });
                    if (ok) router.refresh();
                  },
                })
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
