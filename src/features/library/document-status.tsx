import { CircleAlert, ScanText } from "lucide-react";
import { type DocumentStatus, stageLabel } from "@/server/modules/library/domain/status";

/** What is happening to a document, for its row in the list and its page. */
export function DocumentStatusLine({
  status,
  stage,
  progress,
  errorMessage,
  pageCount,
  ocrPageCount,
}: {
  status: DocumentStatus;
  stage: string | null;
  progress: number;
  errorMessage: string | null;
  pageCount: number | null;
  ocrPageCount: number;
}) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1">
        {pageCount} page{pageCount === 1 ? "" : "s"}
        {ocrPageCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>·</span>
            <ScanText className="size-3.5" aria-hidden />
            {ocrPageCount === pageCount ? "Scanned" : `${ocrPageCount} scanned`}
          </span>
        )}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="text-destructive inline-flex items-start gap-1">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{errorMessage ?? "This file couldn't be processed."}</span>
      </span>
    );
  }
  return (
    <span role="status" className="text-primary inline-flex items-center gap-1.5">
      <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      {stageLabel(status, stage)}
      {status === "processing" && progress > 0 && <span className="tabular-nums">{progress}%</span>}
    </span>
  );
}
