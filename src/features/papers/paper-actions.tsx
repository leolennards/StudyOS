"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deletePaper } from "@/server/actions/exams";
import { type DocumentOption, PaperFormDialog, type PaperFormValues } from "./paper-form-dialog";

/** Opens the add-paper dialog. */
export function AddPaperButton({
  subjectId,
  documents,
  variant = "default",
}: {
  subjectId: string;
  documents: DocumentOption[];
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add a past paper
      </Button>
      <PaperFormDialog open={open} onOpenChange={setOpen} subjectId={subjectId} documents={documents} />
    </>
  );
}

/** Edit and delete for one paper's page. */
export function PaperActions({
  subjectId,
  documents,
  paper,
  attemptCount,
}: {
  subjectId: string;
  documents: DocumentOption[];
  paper: PaperFormValues & { id: string };
  attemptCount: number;
}) {
  const router = useRouter();
  const { run } = useAction();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              setConfirm({
                title: `Delete ${paper.title}?`,
                description:
                  attemptCount > 0
                    ? `This deletes its questions and your ${attemptCount === 1 ? "attempt" : `${attemptCount} attempts`} at it. Linked documents stay in the subject.`
                    : "This deletes its questions. Linked documents stay in the subject.",
                confirmLabel: "Delete paper",
                onConfirm: async () => {
                  const ok = await run(() => deletePaper({ id: paper.id }), { success: "Past paper deleted" });
                  if (ok) router.replace(`/subjects/${subjectId}/papers`);
                },
              })
            }
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PaperFormDialog
        open={editing}
        onOpenChange={setEditing}
        subjectId={subjectId}
        documents={documents}
        paper={paper}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
