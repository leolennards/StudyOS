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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSubject, updateSubject } from "@/server/actions/knowledge";
import { SUBJECT_COLOURS } from "@/server/modules/knowledge/domain/constants";
import { createSubjectSchema } from "@/server/modules/knowledge/schemas";
import { subjectColourClasses } from "./subject-colour";
import { useAction } from "./use-action";

type FormIn = z.input<typeof createSubjectSchema>;
type FormOut = z.output<typeof createSubjectSchema>;

export type SubjectFormValues = {
  id?: string;
  name: string;
  code: string | null;
  term: string | null;
  description: string | null;
  colour: string;
};

export function SubjectFormDialog({
  open,
  onOpenChange,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: SubjectFormValues;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const editing = Boolean(subject?.id);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: blank(subject),
  });
  const { errors } = form.formState;
  const colour = useWatch({ control: form.control, name: "colour" });

  useEffect(() => {
    if (open) form.reset(blank(subject));
  }, [open, subject, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await run(() => (editing ? updateSubject({ id: subject!.id!, ...values }) : createSubject(values)), {
      success: editing ? "Subject updated" : "Subject created",
      onError: (r) => {
        for (const [field, messages] of Object.entries(r.error.fields ?? {})) {
          if (messages?.[0]) form.setError(field as keyof FormIn, { message: messages[0] });
        }
        if (!r.error.fields) form.setError("root", { message: r.error.message });
      },
    });
    if (!result) return;
    onOpenChange(false);
    if (!editing) router.push(`/subjects/${result.id}`);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change how this subject appears."
              : "A subject is one course you're studying, like Organic Chemistry."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {errors.root?.message && (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          )}
          <FormField id="subject-name" label="Name" error={errors.name?.message}>
            <Input placeholder="e.g. Organic Chemistry" autoFocus {...form.register("name")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="subject-code" label="Course code" hint="Optional" error={errors.code?.message}>
              <Input placeholder="e.g. CHEM201" {...form.register("code")} />
            </FormField>
            <FormField id="subject-term" label="Term" hint="Optional" error={errors.term?.message}>
              <Input placeholder="e.g. Semester 2, 2026" {...form.register("term")} />
            </FormField>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLOURS.map((c) => (
                <label key={c} className="cursor-pointer">
                  <input type="radio" value={c} className="peer sr-only" {...form.register("colour")} />
                  <span
                    className={cn(
                      "ring-offset-background peer-focus-visible:ring-ring/50 grid size-8 place-items-center rounded-full ring-offset-2 transition-shadow peer-focus-visible:ring-[3px]",
                      colour === c && "ring-2",
                      subjectColourClasses[c].ring,
                    )}
                  >
                    <span className={cn("size-6 rounded-full", subjectColourClasses[c].dot)} />
                  </span>
                  <span className="sr-only">{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormField id="subject-description" label="Description" hint="Optional" error={errors.description?.message}>
            <Textarea
              rows={3}
              placeholder="What this course covers, your lecturer, anything useful."
              {...form.register("description")}
            />
          </FormField>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Save changes" : "Create subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blank(subject?: SubjectFormValues): FormIn {
  return {
    name: subject?.name ?? "",
    code: subject?.code ?? "",
    term: subject?.term ?? "",
    description: subject?.description ?? "",
    colour: (subject?.colour as FormIn["colour"]) ?? "indigo",
  };
}
