"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE } from "@/server/modules/library/domain/formats";
import { formatBytes } from "./types";
import { useUploads, type UploadItem } from "./use-uploads";

const stateLabel = (item: UploadItem) =>
  item.state === "hashing"
    ? "Preparing"
    : item.state === "uploading"
      ? `Uploading ${item.progress}%`
      : item.state === "confirming"
        ? "Finishing"
        : item.state === "done"
          ? "Uploaded"
          : item.error;

/** Drop files anywhere on the panel, or choose them; each shows its own progress. */
export function DocumentUploader({ subjectId, maxMb }: { subjectId: string; maxMb: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { items, start, dismiss } = useUploads(subjectId);

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) void start([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "bg-card",
        )}
      >
        <div className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
          <Upload className="size-5" aria-hidden />
        </div>
        <div>
          <p className="font-medium">Drop lecture slides, notes, PDFs or photos here</p>
          <p className="text-muted-foreground mt-1 text-sm">
            PDF, Word, PowerPoint, text, Markdown, PNG, JPEG or WebP, up to {maxMb} MB each.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Choose files to upload"
          tabIndex={-1}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length > 0) void start(files);
          }}
        />
      </div>

      {items.length > 0 && (
        <ul aria-label="Uploads" className="grid gap-2">
          {items.map((item) => (
            <li key={item.key} className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              {item.state === "done" ? (
                <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
              ) : item.state === "error" ? (
                <CircleAlert className="text-destructive size-4 shrink-0" aria-hidden />
              ) : (
                <span
                  className="border-primary size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p
                  role={item.state === "error" ? "alert" : undefined}
                  className={cn("text-muted-foreground text-xs", item.state === "error" && "text-destructive")}
                >
                  {stateLabel(item)}
                  {item.size > 0 && item.state !== "error" && ` · ${formatBytes(item.size)}`}
                </p>
                {item.state === "uploading" && (
                  <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-primary h-full transition-[width]" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>
              {(item.state === "done" || item.state === "error") && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Dismiss ${item.name}`}
                  onClick={() => dismiss(item.key)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
