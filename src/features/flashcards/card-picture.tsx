"use client";

import type { OcclusionBox } from "@/server/modules/flashcards/domain/occlusion";
import { cn } from "@/lib/utils";

/** Where the browser loads a card's picture from: a route that checks access, then redirects to storage. */
export const pictureUrl = (imageId: string) => `/api/card-images/${imageId}`;

/** A picture on a card, scaled to fit. */
export function CardPicture({ imageId, alt, className }: { imageId: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served through a signed redirect, so next/image can't optimise it
    <img
      src={pictureUrl(imageId)}
      alt={alt}
      draggable={false}
      className={cn("mx-auto block max-h-80 max-w-full rounded-md border object-contain", className)}
    />
  );
}

/**
 * An image occlusion picture. Every box is covered; the one being asked is
 * marked with a question mark, and once the answer is shown it is uncovered
 * and outlined while the others stay covered.
 */
export function OcclusionPicture({
  imageId,
  boxes,
  target,
  revealed,
  className,
}: {
  imageId: string;
  boxes: OcclusionBox[];
  target: number;
  revealed: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative mx-auto w-fit max-w-full", className)} data-testid="occlusion-picture">
      {/* eslint-disable-next-line @next/next/no-img-element -- served through a signed redirect */}
      <img
        src={pictureUrl(imageId)}
        alt={revealed ? `Picture with box ${target} uncovered` : `Picture with box ${target} to name`}
        draggable={false}
        className="block max-h-[60vh] max-w-full rounded-md border select-none"
      />
      {boxes.map((b) => {
        const asked = b.n === target;
        return (
          <div
            key={b.n}
            aria-hidden
            data-box={b.n}
            data-state={asked ? (revealed ? "uncovered" : "asked") : "covered"}
            className={cn(
              "absolute flex items-center justify-center rounded-sm text-base font-semibold",
              asked
                ? revealed
                  ? "ring-primary ring-[3px]"
                  : "bg-primary text-primary-foreground border-primary border"
                : "bg-muted-foreground border-border border",
            )}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          >
            {asked && !revealed ? "?" : null}
          </div>
        );
      })}
    </div>
  );
}
