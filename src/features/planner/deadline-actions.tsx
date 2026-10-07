"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, type ConfirmState } from "@/features/knowledge/confirm-dialog";
import { useAction } from "@/features/knowledge/use-action";
import { deleteDeadline } from "@/server/actions/planner";
import { DeadlineFormDialog, type DeadlineFormValues } from "./deadline-form-dialog";

/** Edit and delete for one exam's page. */
export function DeadlineActions({
  deadline,
  subjects,
}: {
  deadline: DeadlineFormValues & { id: string };
  subjects: { id: string; name: string }[];
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
                title: `Delete ${deadline.title}?`,
                description:
                  "This removes the date and the topics you picked for it. Your confidence ratings stay on the topics.",
                confirmLabel: "Delete",
                onConfirm: async () => {
                  const ok = await run(() => deleteDeadline({ id: deadline.id }), { success: "Deleted" });
                  if (ok) router.replace("/exams");
                },
              })
            }
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeadlineFormDialog open={editing} onOpenChange={setEditing} subjects={subjects} deadline={deadline} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
