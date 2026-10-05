"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DocumentText, type PageText } from "./document-text";
import { PdfViewer } from "./pdf-viewer";

/** The original (as a PDF or image) and the extracted text, as two tabs. Text-only files show the text. */
export function DocumentViewer({
  title,
  preview,
  viewUrl,
  pages,
  pageLabel,
  initialPage,
}: {
  title: string;
  preview: "pdf" | "image" | "text";
  viewUrl: string | null;
  pages: PageText[];
  pageLabel: string;
  initialPage?: number;
}) {
  const hasOriginal = preview !== "text" && viewUrl !== null;
  const [tab, setTab] = useState<"original" | "text">(hasOriginal ? "original" : "text");

  return (
    <div>
      {hasOriginal && (
        <div role="tablist" aria-label="View" className="mb-4 inline-flex rounded-lg border p-1">
          {(
            [
              ["original", "Original"],
              ["text", "Extracted text"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={tab === value}
              aria-controls={`viewer-${value}`}
              onClick={() => setTab(value)}
              className={cn(
                "focus-visible:ring-ring/50 rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px]",
                tab === value
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div id="viewer-original" role={hasOriginal ? "tabpanel" : undefined} hidden={tab !== "original"}>
        {hasOriginal &&
          (preview === "pdf" ? (
            <PdfViewer url={viewUrl} title={title} initialPage={initialPage} />
          ) : (
            <div className="bg-muted/40 overflow-auto rounded-xl border p-3 sm:p-6">
              {/* A signed, short-lived storage URL: next/image cannot optimise or cache it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewUrl} alt={title} className="mx-auto h-auto max-w-full rounded-sm shadow-sm" />
            </div>
          ))}
      </div>
      <div id="viewer-text" role={hasOriginal ? "tabpanel" : undefined} hidden={tab !== "text"}>
        <DocumentText pages={pages} pageLabel={pageLabel} />
      </div>
    </div>
  );
}
