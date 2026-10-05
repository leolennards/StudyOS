import { cn } from "@/lib/utils";
import { colourClasses } from "./subject-colour";

export function SubjectDot({ colour, className }: { colour: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", colourClasses(colour).dot, className)}
    />
  );
}
