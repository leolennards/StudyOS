"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setTopicConfidence } from "@/server/actions/planner";
import { CONFIDENCE_LABELS, CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/server/modules/planner/domain/exams";
import { CONFIDENCE_CLASSES } from "./confidence-styles";

/**
 * How confident the student feels about a topic: three choices, saved as
 * soon as one is picked. Picking the current choice again clears it.
 */
export function ConfidencePicker({
  topicId,
  topicName,
  level,
}: {
  topicId: string;
  topicName: string;
  level: ConfidenceLevel | null;
}) {
  const [optimistic, setOptimistic] = useOptimistic(level);
  const [, startTransition] = useTransition();

  function choose(next: ConfidenceLevel) {
    const value = optimistic === next ? null : next;
    startTransition(async () => {
      setOptimistic(value);
      try {
        const result = await setTopicConfidence({ topicId, level: value });
        if (!result.ok) toast.error(result.error.message);
      } catch {
        toast.error("We couldn't reach StudyOS. Check your connection and try again.");
      }
    });
  }

  return (
    <div
      role="group"
      aria-label={`How confident are you about ${topicName}?`}
      className="grid grid-cols-3 gap-1 sm:flex"
    >
      {CONFIDENCE_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={optimistic === l}
          onClick={() => choose(l)}
          className={cn(
            "focus-visible:ring-ring/50 flex min-h-8 items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] sm:px-2.5 sm:whitespace-nowrap",
            optimistic === l ? CONFIDENCE_CLASSES[l].on : "text-muted-foreground hover:bg-accent",
          )}
        >
          <span className={cn("size-2 rounded-full", CONFIDENCE_CLASSES[l].dot)} aria-hidden />
          {CONFIDENCE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
