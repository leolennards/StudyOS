"use client";

import { useId, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD_IMAGE_TYPES } from "@/server/modules/flashcards/domain/limits";
import { CardPicture } from "./card-picture";
import { useCardPicture } from "./use-card-picture";

/**
 * A picture on one side of a card: an "Add picture" button, or the picture
 * with a button to take it off. Taking a picture off only changes the card
 * once it is saved; unused pictures are cleaned up later.
 */
export function PictureField({
  subjectId,
  imageId,
  onChange,
  label,
  addLabel = "Add picture",
}: {
  subjectId: string;
  imageId: string | null;
  onChange: (imageId: string | null) => void;
  /** What the picture is, for screen readers: "Picture on the front". */
  label: string;
  addLabel?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useCardPicture(subjectId);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const added = await upload(file);
    if (added) onChange(added);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={CARD_IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {imageId ? (
        <div className="flex items-start gap-2">
          <CardPicture imageId={imageId} alt={label} className="mx-0 max-h-40" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
          >
            <X aria-hidden />
            <span className="sr-only">Remove {label.toLowerCase()}</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden />
          {busy ? "Adding picture…" : addLabel}
          <span className="sr-only">({label.toLowerCase()})</span>
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
