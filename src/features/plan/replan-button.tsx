"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/features/knowledge/use-action";
import { makeStudyPlan } from "@/server/actions/plan";

/** Plans the next seven days again from today, keeping what is finished. */
export function ReplanButton({
  label = "Replan",
  variant = "outline",
  size,
}: {
  label?: string;
  variant?: "default" | "outline";
  size?: "sm";
}) {
  const { run, pending } = useAction();
  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() => run(() => makeStudyPlan({}), { success: "Your week is planned" })}
    >
      <RefreshCw aria-hidden />
      {label}
    </Button>
  );
}
