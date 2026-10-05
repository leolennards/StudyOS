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
import { useAction } from "@/features/knowledge/use-action";
import { updateDocument } from "@/server/actions/library";
import { DOCUMENT_KINDS, type DocumentKind, KIND_LABELS } from "@/server/modules/library/domain/kind";
import { TITLE_MAX } from "@/server/modules/library/domain/limits";

const schema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(TITLE_MAX, `Keep it under ${TITLE_MAX} characters`),
  kind: z.enum(DOCUMENT_KINDS),
});
type Values = z.infer<typeof schema>;

export type DocumentDetails = { id: string; title: string; kind: DocumentKind };

export function DocumentDetailsDialog({ doc, onClose }: { doc: DocumentDetails | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: "", kind: "other" } });
  const { errors } = form.formState;

  useEffect(() => {
    if (doc) form.reset({ title: doc.title, kind: doc.kind });
  }, [doc, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!doc) return;
    const ok = await run(() => updateDocument({ id: doc.id, ...values }), { success: "Document updated" });
    if (ok) onClose();
  });

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>
            The type tells StudyOS how to use it later; past papers and mark schemes get their own analysis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormField id="document-title" label="Title" error={errors.title?.message}>
            <Input autoFocus {...form.register("title")} />
          </FormField>
          <FormField id="document-kind" label="Type" error={errors.kind?.message}>
            <select
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
              {...form.register("kind")}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </FormField>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
