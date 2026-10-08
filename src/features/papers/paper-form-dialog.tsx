"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { selectClass } from "@/features/planner/deadline-form-dialog";
import { createPaper, updatePaper } from "@/server/actions/exams";
import { createPaperSchema } from "@/server/modules/exams/schemas";

type FormIn = z.input<typeof createPaperSchema>;
type FormOut = z.output<typeof createPaperSchema>;

export type PaperFormValues = {
  id?: string;
  title: string;
  year: number | null;
  durationMin: number | null;
  totalMarks: number | null;
  documentId: string | null;
  markSchemeId: string | null;
};

export type DocumentOption = { id: string; title: string; kind: string };

/** Adds a past paper to a subject, or edits one. */
export function PaperFormDialog({
  open,
  onOpenChange,
  subjectId,
  documents,
  paper,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  documents: DocumentOption[];
  paper?: PaperFormValues;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const editing = Boolean(paper?.id);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createPaperSchema),
    defaultValues: blank(subjectId, paper),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(blank(subjectId, paper));
  }, [open, subjectId, paper, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await run(() => (editing ? updatePaper({ ...values, id: paper!.id! }) : createPaper(values)), {
      success: editing ? "Saved" : "Past paper added",
      onError: (r) => {
        for (const [field, messages] of Object.entries(r.error.fields ?? {})) {
          if (messages?.[0]) form.setError(field as keyof FormIn, { message: messages[0] });
        }
        if (!r.error.fields) form.setError("root", { message: r.error.message });
      },
    });
    if (!result) return;
    onOpenChange(false);
    if (!editing) router.push(`/subjects/${subjectId}/papers/${result.id}`);
  });

  // Papers and mark schemes first, then everything else in the subject.
  const sorted = [...documents].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title, undefined, { numeric: true }),
  );
  const documentSelect = (name: "documentId" | "markSchemeId") => (
    <select className={selectClass} {...form.register(name, { setValueAs: (v: string | null) => (v ? v : null) })}>
      <option value="">None</option>
      {sorted.map((d) => (
        <option key={d.id} value={d.id}>
          {d.title}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit past paper" : "Add a past paper"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change the details. Your questions and attempts stay as they are."
              : "Add the paper, then enter its questions to see which topics are worth the most marks."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {errors.root?.message && (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          )}
          <FormField id="paper-title" label="Name" error={errors.title?.message}>
            <Input placeholder="e.g. June 2023 Paper 1" autoFocus {...form.register("title")} />
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-3">
            <FormField id="paper-year" label="Year" hint="Optional" error={errors.year?.message}>
              <Input type="number" inputMode="numeric" placeholder="2023" {...form.register("year")} />
            </FormField>
            <FormField id="paper-duration" label="Minutes" hint="Optional" error={errors.durationMin?.message}>
              <Input type="number" inputMode="numeric" placeholder="90" {...form.register("durationMin")} />
            </FormField>
            <FormField id="paper-total" label="Total marks" hint="Optional" error={errors.totalMarks?.message}>
              <Input type="number" inputMode="numeric" placeholder="80" {...form.register("totalMarks")} />
            </FormField>
          </div>
          {documents.length > 0 ? (
            <>
              <FormField
                id="paper-document"
                label="The paper"
                hint="A document in this subject, to open while you work."
                error={errors.documentId?.message}
              >
                {documentSelect("documentId")}
              </FormField>
              <FormField id="paper-mark-scheme" label="Mark scheme" error={errors.markSchemeId?.message}>
                {documentSelect("markSchemeId")}
              </FormField>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Upload the paper and its mark scheme to this subject&apos;s Documents to open them from here.
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Save changes" : "Add paper"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const rank = (kind: string) => (kind === "past_paper" ? 0 : kind === "mark_scheme" ? 1 : 2);

function blank(subjectId: string, paper: PaperFormValues | undefined): FormIn {
  return {
    subjectId,
    title: paper?.title ?? "",
    year: paper?.year ?? "",
    durationMin: paper?.durationMin ?? "",
    totalMarks: paper?.totalMarks ?? "",
    documentId: paper?.documentId ?? null,
    markSchemeId: paper?.markSchemeId ?? null,
  };
}
