"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubjectFormDialog } from "./subject-form-dialog";

/** Opens the new-subject dialog; also opened by `?new=1` (the sidebar's + button). */
export function NewSubjectButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get("new") === "1");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && params.get("new")) router.replace(pathname);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New subject
      </Button>
      <SubjectFormDialog open={open} onOpenChange={onOpenChange} />
    </>
  );
}
