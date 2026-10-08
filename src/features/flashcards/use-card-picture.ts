"use client";

import { useState } from "react";
import { createCardImageUpload, finishCardImageUpload } from "@/server/actions/flashcards";
import { CARD_IMAGE_MAX_MB, CARD_IMAGE_TYPES } from "@/server/modules/flashcards/domain/limits";

const isImageType = (type: string): type is (typeof CARD_IMAGE_TYPES)[number] =>
  (CARD_IMAGE_TYPES as readonly string[]).includes(type);

/**
 * Adds a picture to a card from the browser: asks the server for a signed
 * URL, sends the file straight to storage, then has the server check and
 * re-encode it. Resolves to the picture's id.
 */
export function useCardPicture(subjectId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setError(null);
    if (!isImageType(file.type)) {
      setError("Use a PNG, JPEG, WebP or GIF picture.");
      return null;
    }
    if (file.size === 0 || file.size > CARD_IMAGE_MAX_MB * 1024 * 1024) {
      setError(file.size === 0 ? "That file is empty." : `Use a picture under ${CARD_IMAGE_MAX_MB} MB.`);
      return null;
    }
    setBusy(true);
    try {
      const created = await createCardImageUpload({ subjectId, contentType: file.type, size: file.size });
      if (!created.ok) throw new Error(created.error.fields?.size?.[0] ?? created.error.message);
      const sent = await fetch(created.data.upload.url, {
        method: created.data.upload.method,
        headers: created.data.upload.headers,
        body: file,
      }).catch(() => null);
      if (!sent?.ok) throw new Error("The picture didn't upload. Check your connection and try again.");
      const finished = await finishCardImageUpload({ id: created.data.id });
      if (!finished.ok) throw new Error(finished.error.message);
      return finished.data.id;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That picture couldn't be added. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { upload, busy, error, clearError: () => setError(null) };
}
