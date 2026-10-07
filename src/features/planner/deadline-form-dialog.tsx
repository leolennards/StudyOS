"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
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
import { cn } from "@/lib/utils";
import { createDeadline, updateDeadline } from "@/server/actions/planner";
import { DEADLINE_KINDS, KIND_LABELS } from "@/server/modules/planner/domain/exams";
import { createDeadlineSchema } from "@/server/modules/planner/schemas";

type FormIn = z.input<typeof createDeadlineSchema>;
type FormOut = z.output<typeof createDeadlineSchema>;

export type DeadlineFormValues = {
  id?: string;
  kind: FormIn["kind"];
  title: string;
  subjectId: string | null;
  dueOn: string;
  startsAt: string | null;
  location: string | null;
};

export const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50 md:text-sm";

/** Adds or edits an exam, test or assignment deadline. */
export function DeadlineFormDialog({
  open,
  onOpenChange,
  subjects,
  deadline,
  defaultSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: { id: string; name: string }[];
  deadline?: DeadlineFormValues;
  defaultSubjectId?: string | null;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const editing = Boolean(deadline?.id);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createDeadlineSchema),
    defaultValues: blank(deadline, defaultSubjectId, subjects),
  });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "kind" });

  useEffect(() => {
    if (open) form.reset(blank(deadline, defaultSubjectId, subjects));
  }, [open, deadline, defaultSubjectId, subjects, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await run(
      () => (editing ? updateDeadline({ id: deadline!.id!, ...values }) : createDeadline(values)),
      {
        success: editing ? "Saved" : `${KIND_LABELS[values.kind]} added`,
        onError: (r) => {
          for (const [field, messages] of Object.entries(r.error.fields ?? {})) {
            if (messages?.[0]) form.setError(field as keyof FormIn, { message: messages[0] });
          }
          if (!r.error.fields) form.setError("root", { message: r.error.message });
        },
      },
    );
    if (!result) return;
    onOpenChange(false);
    if (!editing) router.push(`/exams/${result.id}`);
  });

  const timeLabel = kind === "assignment" ? "Due at" : "Starts at";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit" : "Add an exam"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change the details. Your topic ratings stay as they are."
              : "Add the date, then rate how confident you feel about each topic."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {errors.root?.message && (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Type</legend>
            <div className="grid grid-cols-3 gap-2">
              {DEADLINE_KINDS.map((k) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" value={k} className="peer sr-only" {...form.register("kind")} />
                  <span
                    className={cn(
                      "peer-focus-visible:ring-ring/50 flex h-9 items-center justify-center rounded-md border text-sm font-medium transition-colors peer-focus-visible:ring-[3px]",
                      kind === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                    )}
                  >
                    {KIND_LABELS[k]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormField id="deadline-title" label="Name" error={errors.title?.message}>
            <Input placeholder="e.g. Biology final exam" autoFocus {...form.register("title")} />
          </FormField>
          <FormField
            id="deadline-subject"
            label="Subject"
            hint="Its topics become your checklist."
            error={errors.subjectId?.message}
          >
            <select
              className={selectClass}
              {...form.register("subjectId", { setValueAs: (v: string | null) => (v ? v : null) })}
            >
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField id="deadline-date" label="Date" error={errors.dueOn?.message}>
              <Input type="date" {...form.register("dueOn")} />
            </FormField>
            <FormField id="deadline-time" label={timeLabel} hint="Optional" error={errors.startsAt?.message}>
              <Input type="time" {...form.register("startsAt")} />
            </FormField>
          </div>
          <FormField id="deadline-location" label="Where" hint="Optional" error={errors.location?.message}>
            <Input placeholder="e.g. Main Hall, or Online" {...form.register("location")} />
          </FormField>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blank(
  deadline: DeadlineFormValues | undefined,
  defaultSubjectId: string | null | undefined,
  subjects: { id: string }[],
): FormIn {
  const subjectId = deadline
    ? deadline.subjectId
    : (defaultSubjectId ?? (subjects.length === 1 ? subjects[0].id : null));
  return {
    kind: deadline?.kind ?? "exam",
    title: deadline?.title ?? "",
    subjectId,
    dueOn: deadline?.dueOn ?? "",
    startsAt: deadline?.startsAt ?? "",
    location: deadline?.location ?? "",
  };
}
