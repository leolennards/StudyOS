import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { escapeLike, parseHighlights, type SearchInput } from "@/server/lib/search-query";
import { getDb, withTransaction } from "@/server/platform/db/client";
import { knowledgeService } from "@/server/modules/knowledge/service";
import {
  countWords,
  displayTitle,
  emptyNoteContent,
  excerpt,
  type NoteNode,
  noteContentToText,
  validateNoteContent,
} from "./domain/content";
import { NOTE_CONTENT_MAX_CHARS, TRASH_RETENTION_DAYS } from "./domain/limits";
import { notesRepository as repo } from "./repository";
import type {
  createNoteSchema,
  emptyTrashSchema,
  moveNoteSchema,
  noteIdSchema,
  saveNoteSchema,
  setNoteTopicsSchema,
} from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Notes module (Architecture §3, §5.4): a student's own notes, written in the
 * block editor and linked to a subject, optionally a section, and topics.
 * Every function requires a RequestContext and only touches its workspace.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requireNote(ctx: RequestContext, id: string) {
  const note = await repo.findNote(getDb(), ctx.workspaceId, id);
  if (!note) throw notFound("That note");
  return note;
}

async function requireActiveNote(ctx: RequestContext, id: string) {
  const note = await requireNote(ctx, id);
  if (note.deletedAt) throw new AppError("VALIDATION", "This note is in the trash. Restore it to change it.");
  return note;
}

/** A section of the note's subject, or a clear error. */
async function checkSection(ctx: RequestContext, subjectId: string, sectionId: string | null | undefined) {
  if (!sectionId) return null;
  const section = await knowledgeService.getSection(ctx, sectionId).catch(() => null);
  if (!section || section.subjectId !== subjectId) {
    throw new AppError("VALIDATION", "That section isn't part of this subject.");
  }
  return section.id;
}

/** Topics of the note's subject, de-duplicated, or a clear error. */
async function checkTopics(ctx: RequestContext, subjectId: string, topicIds: string[]) {
  const unique = [...new Set(topicIds)];
  if (unique.length === 0) return unique;
  const found = await knowledgeService.findTopics(ctx, unique);
  if (found.length !== unique.length || found.some((t) => t.subjectId !== subjectId)) {
    throw new AppError("VALIDATION", "Some of those topics aren't part of this subject.");
  }
  return unique;
}

const purgeDate = (deletedAt: Date) => new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);

export const notesService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  /** A subject's notes (not the trash), most recently edited first, with their topics. */
  async listNotes(ctx: RequestContext, subjectId: string) {
    const topics = await knowledgeService.listTopics(ctx, subjectId);
    const db = getDb();
    const rows = await repo.listForSubject(db, ctx.workspaceId, subjectId, { trashed: false });
    const links = await repo.listTopicLinks(
      db,
      ctx.workspaceId,
      rows.map((r) => r.id),
    );
    const topicName = new Map(topics.map((t) => [t.id, t.name]));
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subjectId,
      sectionId: r.sectionId,
      title: displayTitle(r.title),
      excerpt: excerpt(r.preview),
      wordCount: r.wordCount,
      updatedAt: r.updatedAt,
      topics: links
        .filter((l) => l.noteId === r.id)
        .map((l) => ({ id: l.topicId, name: topicName.get(l.topicId) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  /** A subject's trash, most recently trashed first, with when each note will be deleted for good. */
  async listTrash(ctx: RequestContext, subjectId: string) {
    await knowledgeService.getSubject(ctx, subjectId);
    const rows = await repo.listForSubject(getDb(), ctx.workspaceId, subjectId, { trashed: true });
    return rows.map((r) => ({
      id: r.id,
      title: displayTitle(r.title),
      excerpt: excerpt(r.preview, 120),
      deletedAt: r.deletedAt!,
      purgeAt: purgeDate(r.deletedAt!),
    }));
  },

  async getNote(ctx: RequestContext, id: string) {
    const note = await requireNote(ctx, id);
    const links = await repo.listTopicLinks(getDb(), ctx.workspaceId, [note.id]);
    return {
      id: note.id,
      subjectId: note.subjectId,
      sectionId: note.sectionId,
      title: note.title,
      content: note.content as NoteNode,
      wordCount: note.wordCount,
      revision: note.revision,
      deletedAt: note.deletedAt,
      purgeAt: note.deletedAt ? purgeDate(note.deletedAt) : null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      topicIds: links.map((l) => l.topicId),
    };
  },

  async countNotes(ctx: RequestContext, subjectId?: string) {
    return repo.countNotes(getDb(), ctx.workspaceId, subjectId);
  },

  // ── writes ────────────────────────────────────────────────────────────────
  /** Creates an empty note in a subject, optionally in a section and with topics. */
  async createNote(ctx: RequestContext, input: In<typeof createNoteSchema>) {
    assertCanWrite(ctx);
    await knowledgeService.getSubject(ctx, input.subjectId);
    const sectionId = await checkSection(ctx, input.subjectId, input.sectionId);
    const topicIds = await checkTopics(ctx, input.subjectId, input.topicIds ?? []);
    const id = newId();
    await withTransaction(async (tx) => {
      await repo.insertNote(tx, {
        id,
        workspaceId: ctx.workspaceId,
        subjectId: input.subjectId,
        sectionId,
        title: "",
        content: emptyNoteContent(),
      });
      await repo.replaceTopicLinks(tx, ctx.workspaceId, id, topicIds);
    });
    return { id };
  },

  /**
   * One autosave from the editor. The plain text is derived here from the
   * JSON, never taken from the browser. A save based on an older revision
   * (another tab or device saved in between) is refused, so neither copy
   * silently overwrites the other.
   */
  async saveNote(ctx: RequestContext, input: In<typeof saveNoteSchema>) {
    assertCanWrite(ctx);
    const serialised = JSON.stringify(input.content ?? null);
    if (serialised.length > NOTE_CONTENT_MAX_CHARS) {
      throw new AppError("VALIDATION", "This note is too long to save. Split it into two notes.");
    }
    const invalid = validateNoteContent(input.content);
    if (invalid) throw new AppError("VALIDATION", invalid);
    const content = input.content as NoteNode;
    const contentText = noteContentToText(content);
    const saved = await repo.saveContent(getDb(), ctx.workspaceId, input.id, input.revision, {
      title: input.title,
      content,
      contentText,
      wordCount: countWords(contentText),
    });
    if (saved) return saved;

    const current = await requireActiveNote(ctx, input.id);
    throw new AppError(
      "CONFLICT",
      "This note was changed somewhere else (another tab or device) since you opened it. Reload to see the latest version.",
      { fields: { revision: [String(current.revision)] } },
    );
  },

  /** Puts a note under a section of its subject, or under none. */
  async moveNote(ctx: RequestContext, input: In<typeof moveNoteSchema>) {
    assertCanWrite(ctx);
    const note = await requireActiveNote(ctx, input.id);
    const sectionId = await checkSection(ctx, note.subjectId, input.sectionId);
    await repo.updateNote(getDb(), ctx.workspaceId, note.id, { sectionId });
    return { id: note.id, subjectId: note.subjectId };
  },

  async setTopics(ctx: RequestContext, input: In<typeof setNoteTopicsSchema>) {
    assertCanWrite(ctx);
    const note = await requireActiveNote(ctx, input.id);
    const topicIds = await checkTopics(ctx, note.subjectId, input.topicIds);
    await repo.replaceTopicLinks(getDb(), ctx.workspaceId, note.id, topicIds);
    return { id: note.id, subjectId: note.subjectId };
  },

  // ── trash ─────────────────────────────────────────────────────────────────
  /** Moves a note to the trash, where it stays for 30 days and can be restored. */
  async trashNote(ctx: RequestContext, input: In<typeof noteIdSchema>) {
    assertCanWrite(ctx);
    const note = await requireNote(ctx, input.id);
    if (!note.deletedAt)
      await repo.updateNote(getDb(), ctx.workspaceId, note.id, { deletedAt: new Date() }, { touch: false });
    return { id: note.id, subjectId: note.subjectId };
  },

  async restoreNote(ctx: RequestContext, input: In<typeof noteIdSchema>) {
    assertCanWrite(ctx);
    const note = await requireNote(ctx, input.id);
    if (note.deletedAt) await repo.updateNote(getDb(), ctx.workspaceId, note.id, { deletedAt: null }, { touch: false });
    return { id: note.id, subjectId: note.subjectId };
  },

  /** Deletes a note for good. Only notes already in the trash can be. */
  async deleteNote(ctx: RequestContext, input: In<typeof noteIdSchema>) {
    assertCanWrite(ctx);
    const note = await requireNote(ctx, input.id);
    if (!note.deletedAt) throw new AppError("VALIDATION", "Move the note to the trash first.");
    await repo.deleteNote(getDb(), ctx.workspaceId, note.id);
    return { id: note.id, subjectId: note.subjectId };
  },

  async emptyTrash(ctx: RequestContext, input: In<typeof emptyTrashSchema>) {
    assertCanWrite(ctx);
    await knowledgeService.getSubject(ctx, input.subjectId);
    const deleted = await repo.deleteTrashed(getDb(), ctx.workspaceId, input.subjectId);
    return { subjectId: input.subjectId, deleted };
  },

  // ── search ────────────────────────────────────────────────────────────────
  /** Notes matching a search, best first, each with a highlighted snippet. Used by the search module. */
  async search(ctx: RequestContext, input: SearchInput) {
    const rows = await repo.search(getDb(), ctx.workspaceId, {
      tsquery: input.tsquery,
      text: input.text,
      like: `%${escapeLike(input.text)}%`,
      subjectId: input.subjectId,
      limit: input.limit,
    });
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subjectId,
      title: displayTitle(r.title),
      snippet: parseHighlights(r.headline ?? ""),
    }));
  },

  // ── housekeeping (worker) ─────────────────────────────────────────────────
  /** Deletes notes that have been in the trash longer than the retention period. */
  async systemPurgeTrash(now = new Date()) {
    return repo.systemPurgeTrash(getDb(), new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS));
  },
};
