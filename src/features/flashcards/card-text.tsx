"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { ClozeSegment } from "@/server/modules/flashcards/domain/cloze";
import type { ItemFaces } from "@/server/modules/flashcards/domain/items";
import { cn } from "@/lib/utils";
import { splitMath } from "./math-text";

/**
 * Renders card text: plain text with its line breaks, and LaTeX maths
 * through KaTeX. Text is rendered by React (never as HTML), and KaTeX runs
 * with `trust` off, so nothing a student types can inject markup.
 */
export function CardText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMath(text), [text]);
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.value}</span>;
        const html = katex.renderToString(s.value, {
          displayMode: s.kind === "block",
          throwOnError: false,
          trust: false,
          strict: "ignore",
        });
        return s.kind === "block" ? (
          <span key={i} className="my-2 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </span>
  );
}

/** Cloze text, with the hidden deletion shown as a blank or, on the answer side, highlighted. */
export function ClozeText({ segments, className }: { segments: ClozeSegment[]; className?: string }) {
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((s, i) =>
        s.mark === "none" ? (
          <CardText key={i} text={s.text} />
        ) : s.mark === "blank" ? (
          <span
            key={i}
            data-cloze="blank"
            className="bg-primary/10 text-primary rounded-md px-1.5 py-0.5 font-semibold whitespace-nowrap"
          >
            [<CardText text={s.text} />]
          </span>
        ) : (
          <mark key={i} data-cloze="answer" className="text-primary bg-primary/10 rounded-md px-1 py-0.5 font-semibold">
            <CardText text={s.text} />
          </mark>
        ),
      )}
    </span>
  );
}

/** One side of a review item: the prompt, or the answer under it. */
export function ItemQuestion({ faces }: { faces: ItemFaces }) {
  return faces.kind === "cloze" ? <ClozeText segments={faces.question} /> : <CardText text={faces.question} />;
}

export function ItemAnswer({ faces }: { faces: ItemFaces }) {
  if (faces.kind === "cloze") {
    return (
      <>
        <ClozeText segments={faces.answer} />
        {faces.extra && <CardText text={faces.extra} className="text-muted-foreground mt-4 block text-base" />}
      </>
    );
  }
  return <CardText text={faces.answer} />;
}
