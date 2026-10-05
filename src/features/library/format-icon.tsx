import { FileImage, FileText, FileType2, Presentation } from "lucide-react";
import type { DocumentFormat } from "@/server/modules/library/domain/formats";
import { cn } from "@/lib/utils";

/** A tile showing what kind of file a document is. */
export function FormatIcon({ format, className }: { format: DocumentFormat; className?: string }) {
  const Icon =
    format === "pptx"
      ? Presentation
      : format === "png" || format === "jpeg" || format === "webp"
        ? FileImage
        : format === "docx"
          ? FileType2
          : FileText;
  return (
    <span
      aria-hidden
      className={cn("bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg", className)}
    >
      <Icon className="size-5" />
    </span>
  );
}
