"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deleteNote, restoreNote, trashNote } from "@/server/actions/notes";

/**
 * What can be done with a note: move it to the trash (with undo), or, once it
 * is there, restore it or delete it for good. Shared by the editor and the lists.
 */
export function NoteActions({
  note,
  beforeLeave,
  inList = false,
}: {
  note: { id: string; subjectId: string; title: string; trashed: boolean };
  /** Saves pending edits before the note is moved away from. */
  beforeLeave?: () => Promise<void>;
  /** In a list the page stays where it is; on the note's own page it goes back to the list. */
  inList?: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const listUrl = `/subjects/${note.subjectId}/notes`;
  const noteUrl = `${listUrl}/${note.id}`;

  async function moveToTrash() {
    await beforeLeave?.();
    const ok = await run(() => trashNote({ id: note.id }));
    if (!ok) return;
    if (!inList) router.push(listUrl);
    toast.success(`Moved “${note.title}” to the trash`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const restored = await run(() => restoreNote({ id: note.id }));
          if (restored) {
            if (inList) router.refresh();
            else router.push(noteUrl);
          }
        },
      },
    });
  }

  async function restore() {
    const ok = await run(() => restoreNote({ id: note.id }), { success: "Note restored" });
    if (ok) router.refresh();
  }

  const askDelete = () =>
    setConfirm({
      title: `Delete “${note.title}” for good?`,
      description: "The note will be gone permanently. This can't be undone.",
      confirmLabel: "Delete for good",
      onConfirm: async () => {
        const ok = await run(() => deleteNote({ id: note.id }), { success: "Note deleted" });
        if (ok && !inList) router.replace(`${listUrl}?view=trash`);
      },
    });

  if (note.trashed) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={restore} loading={pending} aria-label={`Restore ${note.title}`}>
          <RotateCcw aria-hidden />
          Restore
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={askDelete}
          aria-label={`Delete ${note.title} for good`}
        >
          <Trash2 aria-hidden />
          <span className={inList ? "sr-only sm:not-sr-only" : undefined}>Delete</span>
        </Button>
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${note.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={() => void moveToTrash()}>
          <Trash2 aria-hidden />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
