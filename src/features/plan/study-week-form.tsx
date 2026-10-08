"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CalendarCog, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/features/knowledge/use-action";
import { cn } from "@/lib/utils";
import { saveStudyWeek } from "@/server/actions/plan";
import { formatMinutes, WEEKDAY_NAMES } from "@/server/modules/planner/domain/plan";
import { saveWeekSchema } from "@/server/modules/planner/schemas";

type FormIn = z.input<typeof saveWeekSchema>;
type FormOut = z.output<typeof saveWeekSchema>;

/**
 * Minutes free on each day of the week, Monday first. Saving it plans the
 * week. Used on its own before the first plan, and in a dialog after.
 */
export function StudyWeekForm({
  weekMinutes,
  submitLabel,
  onSaved,
  onCancel,
  className,
}: {
  weekMinutes: number[];
  submitLabel: string;
  onSaved?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const { run, pending } = useAction();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(saveWeekSchema),
    defaultValues: { weekMinutes: weekMinutes.map(String) },
  });
  const values = useWatch({ control: form.control, name: "weekMinutes" }) ?? [];
  const total = values.reduce<number>((t, v) => t + (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0), 0);
  const errors = form.formState.errors.weekMinutes;

  const onSubmit = form.handleSubmit(async (input) => {
    const saved = await run(() => saveStudyWeek(input), { success: "Your week is planned" });
    if (saved) onSaved?.();
  });

  return (
    <form onSubmit={onSubmit} noValidate className={cn("grid gap-4", className)}>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Minutes free each day</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {WEEKDAY_NAMES.map((name, i) => {
            const error = Array.isArray(errors) ? errors[i]?.message : undefined;
            return (
              <div key={name} className="grid gap-1.5">
                <label htmlFor={`week-${i}`} className="text-sm font-medium">
                  {name}
                </label>
                <div className="relative">
                  <Input
                    id={`week-${i}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={5}
                    className="[appearance:textfield] pr-11 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Minutes on ${name}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `week-${i}-error` : undefined}
                    {...form.register(`weekMinutes.${i}`)}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
                    min
                  </span>
                </div>
                {error && (
                  <p id={`week-${i}-error`} className="text-destructive text-xs">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">
          {total > 0 ? `${formatMinutes(total)} a week.` : "No time at all yet."} Put 0 on a day you want off.
        </p>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={pending}>
          <Sparkles aria-hidden />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Opens the weekly time in a dialog, from the plan page's header. */
export function StudyWeekButton({ weekMinutes }: { weekMinutes: number[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarCog aria-hidden />
        Study time
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>When can you study?</DialogTitle>
            <DialogDescription>
              The minutes you have free on each day of the week. Saving replans the days ahead; what you&apos;ve
              finished stays.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <StudyWeekForm
              weekMinutes={weekMinutes}
              submitLabel="Save and replan"
              onSaved={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
