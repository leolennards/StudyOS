"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

/**
 * The PDF viewer (Architecture §3): pdf.js, rendering each page to a canvas
 * as it scrolls into view. pdf.js never runs a PDF's own scripts. Its worker
 * and data files are served from this origin (scripts/copy-pdfjs-assets.mjs).
 */
const ASSETS = "/pdfjs";
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export function PdfViewer({ url, initialPage = 1, title }: { url: string; initialPage?: number; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [current, setCurrent] = useState(initialPage);
  const pages = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf.worker.min.mjs`;
        const task = pdfjs.getDocument({
          url,
          cMapUrl: `${ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${ASSETS}/standard_fonts/`,
          wasmUrl: `${ASSETS}/wasm/`,
          iccUrl: `${ASSETS}/iccs/`,
          enableXfa: false,
        });
        loaded = await task.promise;
        if (cancelled) await loaded.loadingTask.destroy();
        else setPdf(loaded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [url]);

  const goTo = useCallback((n: number) => {
    pages.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (pdf && initialPage > 1) pages.current[initialPage - 1]?.scrollIntoView({ block: "start" });
  }, [pdf, initialPage]);

  // The page indicator follows whichever page fills most of the view.
  useEffect(() => {
    if (!pdf) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const n = Number((visible[0]?.target as HTMLElement | undefined)?.dataset.page);
        if (n) setCurrent(n);
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    for (const el of pages.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [pdf]);

  if (error) {
    return (
      <p role="alert" className="text-destructive rounded-xl border p-6 text-sm">
        This document couldn&apos;t be displayed. Reload the page, or download the original from the menu.
      </p>
    );
  }

  const zoom = ZOOMS[zoomIndex]!;
  return (
    <div className="bg-muted/40 overflow-hidden rounded-xl border">
      <div
        role="toolbar"
        aria-label="Document viewer"
        className="bg-card flex items-center justify-between gap-2 border-b px-2 py-1.5"
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!pdf || current <= 1}
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground min-w-24 text-center text-sm tabular-nums" aria-live="polite">
            {pdf ? `Page ${current} of ${pdf.numPages}` : "Loading…"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={!pdf || current >= pdf.numPages}
            onClick={() => goTo(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((z) => z - 1)}
          >
            <Minus />
          </Button>
          <span className="text-muted-foreground w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOMS.length - 1}
            onClick={() => setZoomIndex((z) => z + 1)}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div className="max-h-[75dvh] overflow-auto p-3 sm:p-6" aria-label={title}>
        {pdf ? (
          <div className="mx-auto grid gap-4" style={{ width: `${zoom * 100}%`, minWidth: "min(100%, 18rem)" }}>
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage
                key={i}
                pdf={pdf}
                pageNumber={i + 1}
                zoom={zoom}
                ref={(el) => {
                  pages.current[i] = el;
                }}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card mx-auto aspect-[1/1.414] w-full max-w-3xl animate-pulse rounded-md" />
        )}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  zoom,
  ref,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  ref: (el: HTMLDivElement | null) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "800px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !canvas.current || !holder.current) return;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current || !holder.current) return;
      const base = page.getViewport({ scale: 1 });
      setAspect(base.height / base.width);
      const cssWidth = holder.current.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvas: c, viewport });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, pdf, pageNumber, zoom]);

  return (
    <div
      ref={(el) => {
        holder.current = el;
        ref(el);
      }}
      data-page={pageNumber}
      className="bg-background relative w-full overflow-hidden rounded-sm shadow-sm"
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      <canvas ref={canvas} className="block h-full w-full" role="img" aria-label={`Page ${pageNumber}`} />
    </div>
  );
}
