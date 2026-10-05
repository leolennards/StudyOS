"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { emptyTrash } from "@/server/actions/notes";
import { NoteActions } from "./note-actions";

export type TrashItem = { id: string; subjectId: string; title: string; excerpt: string; purgeAt: string };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Notes in a subject's trash, each with when it will be deleted for good. */
export function TrashList({ subjectId, notes }: { subjectId: string; notes: TrashItem[] }) {
  const { run } = useAction();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">Notes in the trash are deleted for good after 30 days.</p>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() =>
            setConfirm({
              title: "Empty the trash?",
              description: `This permanently deletes ${notes.length === 1 ? "1 note" : `${notes.length} notes`}. It can't be undone.`,
              confirmLabel: "Empty trash",
              onConfirm: () => run(() => emptyTrash({ subjectId }), { success: "Trash emptied" }),
            })
          }
        >
          <Trash2 aria-hidden />
          Empty trash
        </Button>
      </div>
      <ul aria-label="Trash" className="bg-card divide-y overflow-hidden rounded-xl border">
        {notes.map((note) => (
          <li key={note.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{note.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Deleted for good on {dateFormat.format(new Date(note.purgeAt))}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <NoteActions inList note={{ id: note.id, subjectId: note.subjectId, title: note.title, trashed: true }} />
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
