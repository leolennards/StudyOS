import { getDb } from "@/server/platform/db/client";
import { logger } from "@/server/platform/observability/logger";
import { cardImagePrefix, getStorage, parseCardImageKey } from "@/server/platform/storage";
import { flashcardsRepository as repo } from "./repository";

/**
 * The flashcards module's job handlers, registered by the worker
 * (src/worker/index.ts).
 */

/** A picture no card uses is kept this long, so one being added to a card isn't removed mid-edit. */
const UNUSED_AFTER_MS = 24 * 60 * 60 * 1000;

export const flashcardsJobs = {
  /**
   * Hourly housekeeping (ADR-021): deletes pictures no card uses a day after
   * upload (never saved on a card, taken off one, or their card deleted), and
   * stored pictures whose row no longer exists (after a subject or an
   * account was deleted, which removes the rows through cascades).
   */
  async cleanUpImages(now = new Date()) {
    const db = getDb();
    const storage = getStorage();
    let unused = 0;
    for (const row of await repo.systemUnusedImages(db, new Date(now.getTime() - UNUSED_AFTER_MS))) {
      await storage.deletePrefix(cardImagePrefix(row.workspaceId, row.id));
      await repo.systemDeleteImage(db, row.workspaceId, row.id);
      unused += 1;
    }

    const stored = new Map<string, { workspaceId: string; imageId: string }>();
    for (const key of await storage.list("ws/")) {
      const parsed = parseCardImageKey(key);
      if (parsed) stored.set(`${parsed.workspaceId}/${parsed.imageId}`, parsed);
    }
    const candidates = [...stored.values()];
    let orphaned = 0;
    for (let i = 0; i < candidates.length; i += 500) {
      const batch = candidates.slice(i, i + 500);
      const existing = await repo.systemExistingImages(
        db,
        batch.map((c) => c.imageId),
      );
      for (const c of batch) {
        if (existing.has(`${c.workspaceId}/${c.imageId}`)) continue;
        await storage.deletePrefix(cardImagePrefix(c.workspaceId, c.imageId));
        orphaned += 1;
      }
    }
    logger.info({ unused, orphaned }, "card pictures cleaned up");
    return { unused, orphaned };
  },
};
