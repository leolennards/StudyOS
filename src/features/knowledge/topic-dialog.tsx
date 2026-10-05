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
import { Textarea } from "@/components/ui/textarea";
import { createTopic, updateTopic } from "@/server/actions/knowledge";
import { LIMITS } from "@/server/modules/knowledge/domain/constants";
import type { SectionOption } from "./types";
import { useAction } from "./use-action";

const NO_SECTION = "";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give it a name")
    .max(LIMITS.topicName, `Keep it under ${LIMITS.topicName} characters`),
  description: z.string().trim().max(LIMITS.topicDescription, `Keep it under ${LIMITS.topicDescription} characters`),
  sectionId: z.string(),
});
type Values = z.infer<typeof schema>;

export type TopicDialogState =
  | { mode: "create"; sectionId: string | null }
  | { mode: "edit"; id: string; name: string; description: string | null; sectionId: string | null };

export function TopicDialog({
  subjectId,
  sections,
  state,
  onClose,
}: {
  subjectId: string;
  sections: SectionOption[];
  state: TopicDialogState | null;
  onClose: () => void;
}) {
  const { run, pending } = useAction();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", sectionId: NO_SECTION },
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (!state) return;
    form.reset(
      state.mode === "edit"
        ? { name: state.name, description: state.description ?? "", sectionId: state.sectionId ?? NO_SECTION }
        : { name: "", description: "", sectionId: state.sectionId ?? NO_SECTION },
    );
  }, [state, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!state) return;
    const sectionId = values.sectionId === NO_SECTION ? null : values.sectionId;
    const ok = await run(
      () =>
        state.mode === "edit"
          ? updateTopic({ id: state.id, name: values.name, description: values.description, sectionId })
          : createTopic({ subjectId, sectionId, name: values.name, description: values.description }),
      { success: state.mode === "edit" ? "Topic updated" : "Topic added" },
    );
    if (ok) onClose();
  });

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Edit topic" : "Add a topic"}</DialogTitle>
          <DialogDescription>
            Topics are the ideas you need to know. StudyOS tracks your progress on each one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormField id="topic-name" label="Name" error={errors.name?.message}>
            <Input placeholder="e.g. Second law of thermodynamics" autoFocus {...form.register("name")} />
          </FormField>
          <FormField id="topic-section" label="Section" error={errors.sectionId?.message}>
            <select
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
              {...form.register("sectionId")}
            >
              <option value={NO_SECTION}>No section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.depth > 1 ? " " : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="topic-description" label="Description" hint="Optional" error={errors.description?.message}>
            <Textarea
              rows={3}
              placeholder="A short note on what this topic covers."
              {...form.register("description")}
            />
          </FormField>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {state?.mode === "edit" ? "Save changes" : "Add topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
