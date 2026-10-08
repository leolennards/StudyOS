"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { ClozeSegment } from "@/server/modules/flashcards/domain/cloze";
import type { ItemFaces } from "@/server/modules/flashcards/domain/items";
import { cn } from "@/lib/utils";
import { CardPicture, OcclusionPicture } from "./card-picture";
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

/** Text and a picture on one side of a card, either of which may be missing. */
function Side({
  text,
  imageId,
  alt,
  className,
}: {
  text: string;
  imageId: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <>
      {text && <CardText text={text} className={className} />}
      {imageId && <CardPicture imageId={imageId} alt={alt} className={text ? "mt-4" : undefined} />}
    </>
  );
}

/** What an image occlusion card asks when the student didn't write a prompt. */
const DEFAULT_OCCLUSION_PROMPT = "What is under the highlighted box?";

/** One side of a review item: the prompt, or the answer under it. */
export function ItemQuestion({ faces }: { faces: ItemFaces }) {
  if (faces.kind === "occlusion") {
    return (
      <>
        <CardText text={faces.prompt || DEFAULT_OCCLUSION_PROMPT} className="mb-4 block" />
        <OcclusionPicture imageId={faces.imageId} boxes={faces.boxes} target={faces.target} revealed={false} />
      </>
    );
  }
  if (faces.kind === "cloze") {
    return (
      <>
        <ClozeText segments={faces.question} />
        {faces.imageId && <CardPicture imageId={faces.imageId} alt="Picture on the card" className="mt-4" />}
      </>
    );
  }
  return <Side text={faces.question} imageId={faces.questionImageId} alt="Picture on the question" />;
}

export function ItemAnswer({ faces }: { faces: ItemFaces }) {
  if (faces.kind === "occlusion") {
    return (
      <>
        <CardText text={faces.prompt || DEFAULT_OCCLUSION_PROMPT} className="mb-4 block" />
        <OcclusionPicture imageId={faces.imageId} boxes={faces.boxes} target={faces.target} revealed />
        {faces.extra && <CardText text={faces.extra} className="text-muted-foreground mt-4 block text-base" />}
      </>
    );
  }
  if (faces.kind === "cloze") {
    return (
      <>
        <ClozeText segments={faces.answer} />
        {faces.imageId && <CardPicture imageId={faces.imageId} alt="Picture on the card" className="mt-4" />}
        {faces.extra && <CardText text={faces.extra} className="text-muted-foreground mt-4 block text-base" />}
        {faces.extraImageId && (
          <CardPicture imageId={faces.extraImageId} alt="Picture shown with the answer" className="mt-4" />
        )}
      </>
    );
  }
  return <Side text={faces.answer} imageId={faces.answerImageId} alt="Picture on the answer" />;
}
