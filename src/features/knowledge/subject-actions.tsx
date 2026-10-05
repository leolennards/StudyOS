"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { deleteSubject, setSubjectArchived } from "@/server/actions/knowledge";
import { SubjectFormDialog, type SubjectFormValues } from "./subject-form-dialog";
import { useAction } from "./use-action";

export function SubjectActions({
  subject,
  archived,
}: {
  subject: SubjectFormValues & { id: string };
  archived: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmError, setConfirmError] = useState<string | undefined>();

  async function toggleArchive() {
    await run(() => setSubjectArchived({ id: subject.id, archived: !archived }), {
      success: archived ? "Subject restored" : "Subject archived",
    });
  }

  async function onDelete() {
    setConfirmError(undefined);
    const ok = await run(() => deleteSubject({ id: subject.id, confirmName }), {
      success: "Subject deleted",
      onError: (r) => setConfirmError(r.error.fields?.confirmName?.[0] ?? r.error.message),
    });
    if (ok) {
      setDeleting(false);
      router.replace("/subjects");
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More subject actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchive}>
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? "Restore subject" : "Archive subject"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            Delete subject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SubjectFormDialog open={editing} onOpenChange={setEditing} subject={subject} />

      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (pending) return;
          setDeleting(open);
          setConfirmName("");
          setConfirmError(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {subject.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the subject with all its sections and topics. It can&apos;t be undone. If
              you&apos;re just finished with the course, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormField
            id="confirm-subject-name"
            label={
              <>
                Type <strong className="mx-0.5">{subject.name}</strong> to confirm
              </>
            }
            error={confirmError}
          >
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </FormField>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={pending}
              disabled={confirmName.trim().toLowerCase() !== subject.name.trim().toLowerCase()}
              onClick={onDelete}
            >
              Delete subject
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
