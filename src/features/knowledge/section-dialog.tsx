"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { createSection, updateSection } from "@/server/actions/knowledge";
import { LIMITS, SECTION_LABEL_SUGGESTIONS } from "@/server/modules/knowledge/domain/constants";
import { useAction } from "./use-action";

const schema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give it a label")
    .max(LIMITS.sectionLabel, `Keep it under ${LIMITS.sectionLabel} characters`),
  title: z
    .string()
    .trim()
    .min(1, "Give it a title")
    .max(LIMITS.sectionTitle, `Keep it under ${LIMITS.sectionTitle} characters`),
});
type Values = z.infer<typeof schema>;

export type SectionDialogState =
  | { mode: "create"; subjectId: string; parentId: string | null; parentName?: string; defaultLabel: string }
  | { mode: "edit"; id: string; label: string; title: string };

export function SectionDialog({ state, onClose }: { state: SectionDialogState | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { label: "", title: "" } });
  const { errors } = form.formState;

  useEffect(() => {
    if (!state) return;
    form.reset(
      state.mode === "edit" ? { label: state.label, title: state.title } : { label: state.defaultLabel, title: "" },
    );
  }, [state, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!state) return;
    const ok = await run(
      () =>
        state.mode === "edit"
          ? updateSection({ id: state.id, ...values })
          : createSection({ subjectId: state.subjectId, parentId: state.parentId, ...values }),
      { success: state.mode === "edit" ? "Section updated" : "Section added" },
    );
    if (ok) onClose();
  });

  const title =
    state?.mode === "edit"
      ? "Edit section"
      : state?.parentId
        ? `Add a section inside ${state.parentName}`
        : "Add a section";

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Use whatever your course calls it: a module, chapter, week or lecture.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <FormField id="section-label" label="Label" error={errors.label?.message}>
              <Input list="section-label-suggestions" {...form.register("label")} />
            </FormField>
            <FormField id="section-title" label="Title" error={errors.title?.message}>
              <Input placeholder="e.g. Thermodynamics" autoFocus {...form.register("title")} />
            </FormField>
            <datalist id="section-label-suggestions">
              {SECTION_LABEL_SUGGESTIONS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {state?.mode === "edit" ? "Save changes" : "Add section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
