import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** An inline message for a whole form (field errors sit under their fields). */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-success/30 bg-success/5 text-foreground",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "success" && "text-success")} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
