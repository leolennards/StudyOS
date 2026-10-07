"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { updateSettings } from "@/server/actions/settings";
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "@/server/modules/progress/domain/limits";

const SUGGESTIONS = [15, 30, 60, 90, 120];

/** The daily study goal (Architecture §29), in minutes of focus and flashcard time. */
export function GoalForm({ dailyGoalMinutes }: { dailyGoalMinutes: number }) {
  const id = useId();
  const { run, pending } = useAction();
  const [minutes, setMinutes] = useState(String(dailyGoalMinutes));
  const [error, setError] = useState<string>();
  const value = Number(minutes);

  async function save() {
    setError(undefined);
    await run(() => updateSettings({ dailyGoalMinutes: value }), {
      success: "Daily goal saved",
      onError: (r) => setError(r.error.fields?.dailyGoalMinutes?.[0] ?? r.error.message),
    });
  }

  return (
    <div className="grid max-w-md gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested goals">
        {SUGGESTIONS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value === m}
            onClick={() => setMinutes(String(m))}
            className={cn(
              "focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]",
              value === m ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-accent",
            )}
          >
            {m < 60 ? `${m} min` : `${m / 60} h`}
          </button>
        ))}
      </div>
      <FormField
        id={`${id}-goal`}
        label="Minutes per day"
        error={error}
        hint="Focus sessions and time spent on flashcards both count. Pick something you can manage on a busy day."
      >
        <Input
          type="number"
          inputMode="numeric"
          min={DAILY_GOAL_MIN}
          max={DAILY_GOAL_MAX}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </FormField>
      <div>
        <Button onClick={save} loading={pending} disabled={value === dailyGoalMinutes}>
          Save
        </Button>
      </div>
    </div>
  );
}
