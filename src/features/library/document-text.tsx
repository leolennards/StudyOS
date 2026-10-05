import { ScanText } from "lucide-react";
import type { Block } from "@/server/modules/library/types";

export type PageText = {
  pageNumber: number;
  text: string;
  blocks: Block[] | null;
  ocrUsed: boolean;
  ocrConfidence: number | null;
};

/**
 * The text StudyOS read from each page. This is what search and the tutor
 * will work from, so it is shown as it is stored, OCR caveats included
 * (Architecture §10: "text recognised by OCR, may contain errors").
 */
export function DocumentText({ pages, pageLabel }: { pages: PageText[]; pageLabel: string }) {
  return (
    <div className="grid gap-4">
      {pages.map((p) => (
        <section
          key={p.pageNumber}
          aria-labelledby={`page-${p.pageNumber}`}
          className="bg-card rounded-xl border p-4 sm:p-6"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2
              id={`page-${p.pageNumber}`}
              className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
            >
              {pageLabel} {p.pageNumber}
            </h2>
            {p.ocrUsed && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <ScanText className="size-3.5" aria-hidden />
                Read by OCR{p.ocrConfidence !== null && `, ${Math.round(p.ocrConfidence)}% confidence`}. It may contain
                errors.
              </span>
            )}
          </div>
          {p.text.trim() === "" ? (
            <p className="text-muted-foreground text-sm italic">No text was found on this {pageLabel.toLowerCase()}.</p>
          ) : p.blocks ? (
            <div className="grid max-w-prose gap-2 text-sm leading-relaxed">
              {p.blocks.map((b, i) =>
                b.type === "heading" ? (
                  <p key={i} className={b.level && b.level > 1 ? "mt-2 font-semibold" : "mt-2 text-base font-semibold"}>
                    {b.text}
                  </p>
                ) : b.type === "list_item" ? (
                  <p key={i} className="flex gap-2 pl-2">
                    <span aria-hidden>•</span>
                    <span>{b.text}</span>
                  </p>
                ) : b.type === "note" ? (
                  <p
                    key={i}
                    className="bg-muted/60 text-muted-foreground mt-2 rounded-md px-3 py-2 whitespace-pre-line"
                  >
                    <span className="text-foreground font-medium">Speaker notes: </span>
                    {b.text}
                  </p>
                ) : (
                  <p key={i} className="whitespace-pre-line">
                    {b.text}
                  </p>
                ),
              )}
            </div>
          ) : (
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">{p.text}</p>
          )}
        </section>
      ))}
    </div>
  );
}
