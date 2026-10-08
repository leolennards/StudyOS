"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  boxFromPoints,
  nextBoxNumber,
  OCCLUSION_LIMITS,
  type OcclusionBox,
} from "@/server/modules/flashcards/domain/occlusion";
import { cn } from "@/lib/utils";
import { pictureUrl } from "./card-picture";

type Point = { x: number; y: number };

/**
 * Draw boxes over the parts of a picture to hide. Drag to draw a box, tap a
 * box to select it, and press Delete (or its button in the list) to remove
 * it. Each box becomes one review item, numbered in the order drawn.
 */
export function OcclusionEditor({
  imageId,
  boxes,
  onChange,
  describedBy,
}: {
  imageId: string;
  boxes: OcclusionBox[];
  onChange: (boxes: OcclusionBox[]) => void;
  describedBy?: string;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [draft, setDraft] = useState<OcclusionBox | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // The highest number drawn since the editor opened, so a removed box's number isn't handed out again.
  const highestUsed = useRef(nextBoxNumber(boxes) - 1);
  const full = boxes.length >= OCCLUSION_LIMITS.boxes;

  const pointAt = (e: React.PointerEvent): Point => {
    const rect = areaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const boxAt = (p: Point) =>
    [...boxes].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    areaRef.current?.focus();
    areaRef.current?.setPointerCapture(e.pointerId);
    setStart(pointAt(e));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start || full) return;
    setDraft(boxFromPoints(nextBoxNumber(boxes, highestUsed.current), start, pointAt(e)));
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!start) return;
    const end = pointAt(e);
    const box = full ? null : boxFromPoints(nextBoxNumber(boxes, highestUsed.current), start, end);
    setStart(null);
    setDraft(null);
    if (box) {
      highestUsed.current = Math.max(highestUsed.current, box.n);
      onChange([...boxes, box]);
      setSelected(box.n);
    } else {
      setSelected(boxAt(end)?.n ?? null);
    }
  }

  const remove = (n: number) => {
    onChange(boxes.filter((b) => b.n !== n));
    setSelected(null);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
      e.preventDefault();
      remove(selected);
    }
  }

  return (
    <div className="grid gap-3">
      <div
        ref={areaRef}
        role="application"
        aria-label="Picture. Drag to draw a box over each part to hide."
        aria-describedby={describedBy}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setStart(null);
          setDraft(null);
        }}
        onKeyDown={onKeyDown}
        data-testid="occlusion-editor"
        className="focus-visible:ring-ring/50 relative mx-auto w-fit max-w-full cursor-crosshair touch-none rounded-md outline-none select-none focus-visible:ring-[3px]"
      >
        {/* A signed, short-lived storage URL behind a redirect: next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pictureUrl(imageId)}
          alt=""
          draggable={false}
          className="pointer-events-none block max-h-[50vh] max-w-full rounded-md border"
        />
        {[...boxes, ...(draft ? [draft] : [])].map((b) => (
          <div
            key={b === draft ? "draft" : b.n}
            data-box={b === draft ? undefined : b.n}
            className={cn(
              "bg-primary/75 text-primary-foreground border-primary absolute flex items-center justify-center rounded-sm border text-sm font-semibold",
              b.n === selected && b !== draft && "ring-foreground ring-2 ring-offset-1",
            )}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          >
            {b === draft ? null : b.n}
          </div>
        ))}
      </div>

      {boxes.length > 0 && (
        <ul aria-label="Boxes" className="flex flex-wrap gap-2">
          {boxes.map((b) => (
            <li key={b.n}>
              <Button
                type="button"
                variant={b.n === selected ? "secondary" : "outline"}
                size="sm"
                onClick={() => remove(b.n)}
                aria-label={`Remove box ${b.n}`}
              >
                Box {b.n}
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full && <p className="text-muted-foreground text-sm">A card can hide at most {OCCLUSION_LIMITS.boxes} boxes.</p>}
    </div>
  );
}
