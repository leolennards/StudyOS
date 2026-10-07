"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeadlineFormDialog } from "./deadline-form-dialog";

/** Opens the add-exam dialog; also opened by `?new=1`, with `?subject=` choosing the subject. */
export function NewDeadlineButton({
  subjects,
  variant = "default",
  label = "Add an exam",
}: {
  subjects: { id: string; name: string }[];
  variant?: "default" | "outline";
  label?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get("new") === "1");
  const subject = params.get("subject");
  const defaultSubjectId = subject && subjects.some((s) => s.id === subject) ? subject : null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && params.get("new")) router.replace(pathname);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <DeadlineFormDialog
        open={open}
        onOpenChange={onOpenChange}
        subjects={subjects}
        defaultSubjectId={defaultSubjectId}
      />
    </>
  );
}
