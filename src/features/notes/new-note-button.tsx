"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/features/knowledge/use-action";
import { createNote } from "@/server/actions/notes";

/** Creates an empty note and opens it, ready to type. */
export function NewNoteButton({
  subjectId,
  sectionId,
  variant = "default",
}: {
  subjectId: string;
  sectionId?: string | null;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={async () => {
        const created = await run(() => createNote({ subjectId, sectionId }));
        if (created) router.push(`/subjects/${subjectId}/notes/${created.id}`);
      }}
    >
      {!pending && <Plus aria-hidden />}
      New note
    </Button>
  );
}
