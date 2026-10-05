import type { z } from "zod";
import type { RequestContext } from "@/server/lib/context";
import { AppError, notFound } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { escapeLike, type SearchInput } from "@/server/lib/search-query";
import { getDb } from "@/server/platform/db/client";
import { buildTree, canAddChild, moveWithin, nextPosition } from "./domain/tree";
import { knowledgeRepository as repo } from "./repository";
import type {
  archiveSubjectSchema,
  createSectionSchema,
  createSubjectSchema,
  createTopicSchema,
  deleteSubjectSchema,
  moveSchema,
  updateSectionSchema,
  updateSubjectSchema,
  updateTopicSchema,
} from "./schemas";

type In<S extends z.ZodType> = z.output<S>;

/**
 * Knowledge module: subjects, sections and topics (ADR-006).
 * Every function requires a RequestContext and only touches its workspace.
 */

function assertCanWrite(ctx: RequestContext) {
  if (ctx.role === "viewer") throw new AppError("FORBIDDEN");
}

async function requireSubject(ctx: RequestContext, id: string) {
  const subject = await repo.findSubject(getDb(), ctx.workspaceId, id);
  if (!subject) throw notFound("That subject");
  return subject;
}

async function requireSection(ctx: RequestContext, id: string) {
  const section = await repo.findSection(getDb(), ctx.workspaceId, id);
  if (!section) throw notFound("That section");
  return section;
}

async function requireTopic(ctx: RequestContext, id: string) {
  const topic = await repo.findTopic(getDb(), ctx.workspaceId, id);
  if (!topic) throw notFound("That topic");
  return topic;
}

export const knowledgeService = {
  // ── reads ─────────────────────────────────────────────────────────────────
  async listSubjects(ctx: RequestContext, opts: { archived?: boolean } = {}) {
    const rows = await repo.listSubjects(getDb(), ctx.workspaceId, { archived: opts.archived ?? false });
    return rows.map((r) => ({ ...r.subject, sectionCount: r.sectionCount, topicCount: r.topicCount }));
  },

  async getSubject(ctx: RequestContext, id: string) {
    return requireSubject(ctx, id);
  },

  /** The subject with its nested sections and their topics. */
  async getSubjectTree(ctx: RequestContext, subjectId: string) {
    const subject = await requireSubject(ctx, subjectId);
    const db = getDb();
    const [sectionRows, topicRows] = await Promise.all([
      repo.listSectionsForSubject(db, ctx.workspaceId, subjectId),
      repo.listTopicsForSubject(db, ctx.workspaceId, subjectId),
    ]);
    const { roots, unsectioned } = buildTree(sectionRows, topicRows);
    return { subject, sections: roots, unsectioned, sectionCount: sectionRows.length, topicCount: topicRows.length };
  },

  /** Subjects and topics whose names match a search. Used by the search module. */
  async search(ctx: RequestContext, input: SearchInput) {
    const db = getDb();
    const q = {
      text: input.text,
      like: `%${escapeLike(input.text)}%`,
      prefix: `${escapeLike(input.text)}%`,
      limit: input.limit,
    };
    const [subjectRows, topicRows] = await Promise.all([
      input.subjectId ? Promise.resolve([]) : repo.searchSubjects(db, ctx.workspaceId, q),
      repo.searchTopics(db, ctx.workspaceId, { ...q, subjectId: input.subjectId }),
    ]);
    return {
      subjects: subjectRows.map((s) => ({ ...s, archived: s.archivedAt !== null })),
      topics: topicRows,
    };
  },

  /** A section in the caller's workspace, for other modules that file things under sections. */
  async getSection(ctx: RequestContext, id: string) {
    return requireSection(ctx, id);
  },

  /** A subject's topics in display order, for pickers in other modules. */
  async listTopics(ctx: RequestContext, subjectId: string) {
    await requireSubject(ctx, subjectId);
    return repo.listTopicsForSubject(getDb(), ctx.workspaceId, subjectId);
  },

  /** The topics with these ids that exist in the caller's workspace. Unknown ids are left out. */
  async findTopics(ctx: RequestContext, ids: string[]) {
    return repo.listTopicsByIds(getDb(), ctx.workspaceId, ids);
  },

  async countActiveSubjects(ctx: RequestContext) {
    return repo.countSubjects(getDb(), ctx.workspaceId);
  },

  // ── subjects ──────────────────────────────────────────────────────────────
  async createSubject(ctx: RequestContext, input: In<typeof createSubjectSchema>) {
    assertCanWrite(ctx);
    const id = newId();
    await repo.insertSubject(getDb(), {
      id,
      workspaceId: ctx.workspaceId,
      name: input.name,
      code: input.code ?? null,
      term: input.term ?? null,
      description: input.description ?? null,
      colour: input.colour,
    });
    return { id };
  },

  async updateSubject(ctx: RequestContext, input: In<typeof updateSubjectSchema>) {
    assertCanWrite(ctx);
    const { id, ...patch } = input;
    const ok = await repo.updateSubject(getDb(), ctx.workspaceId, id, patch);
    if (!ok) throw notFound("That subject");
    return { id };
  },

  async setSubjectArchived(ctx: RequestContext, input: In<typeof archiveSubjectSchema>) {
    assertCanWrite(ctx);
    const ok = await repo.updateSubject(getDb(), ctx.workspaceId, input.id, {
      archivedAt: input.archived ? new Date() : null,
    });
    if (!ok) throw notFound("That subject");
    return { id: input.id };
  },

  /** Permanent deletion; the user must type the subject's name to confirm. */
  async deleteSubject(ctx: RequestContext, input: In<typeof deleteSubjectSchema>) {
    assertCanWrite(ctx);
    const subject = await requireSubject(ctx, input.id);
    if (input.confirmName.trim().toLowerCase() !== subject.name.trim().toLowerCase()) {
      throw new AppError("VALIDATION", "Type the subject's name exactly to confirm.", {
        fields: { confirmName: ["The name doesn't match"] },
      });
    }
    await repo.deleteSubject(getDb(), ctx.workspaceId, subject.id);
    return { id: subject.id };
  },

  // ── sections ──────────────────────────────────────────────────────────────
  async createSection(ctx: RequestContext, input: In<typeof createSectionSchema>) {
    assertCanWrite(ctx);
    await requireSubject(ctx, input.subjectId);
    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = await requireSection(ctx, parentId);
      if (parent.subjectId !== input.subjectId)
        throw new AppError("VALIDATION", "That section belongs to another subject.");
      const parentDepth = parent.parentId ? 2 : 1;
      if (!canAddChild(parentDepth)) {
        throw new AppError("VALIDATION", "Sections can only be nested two levels deep.");
      }
    }
    const db = getDb();
    return db.transaction(async (tx) => {
      const siblings = await repo.listSiblingSections(tx, ctx.workspaceId, input.subjectId, parentId);
      const id = newId();
      await repo.insertSection(tx, {
        id,
        workspaceId: ctx.workspaceId,
        subjectId: input.subjectId,
        parentId,
        label: input.label,
        title: input.title,
        position: nextPosition(siblings),
      });
      return { id };
    });
  },

  async updateSection(ctx: RequestContext, input: In<typeof updateSectionSchema>) {
    assertCanWrite(ctx);
    const { id, ...patch } = input;
    const ok = await repo.updateSection(getDb(), ctx.workspaceId, id, patch);
    if (!ok) throw notFound("That section");
    return { id };
  },

  async moveSection(ctx: RequestContext, input: In<typeof moveSchema>) {
    assertCanWrite(ctx);
    const section = await requireSection(ctx, input.id);
    return getDb().transaction(async (tx) => {
      const siblings = await repo.listSiblingSections(tx, ctx.workspaceId, section.subjectId, section.parentId);
      const changes = moveWithin(siblings, section.id, input.direction);
      if (changes.length === 0) return { id: section.id, moved: false };
      for (const c of changes) await repo.updateSection(tx, ctx.workspaceId, c.id, { position: c.position });
      return { id: section.id, moved: true };
    });
  },

  /** What deleting a section would affect, for the confirmation dialog. */
  async sectionDeleteImpact(ctx: RequestContext, id: string) {
    const section = await requireSection(ctx, id);
    const all = await repo.listSectionsForSubject(getDb(), ctx.workspaceId, section.subjectId);
    const childIds = all.filter((s) => s.parentId === section.id).map((s) => s.id);
    const topicCount = await repo.countTopicsInSections(getDb(), ctx.workspaceId, [section.id, ...childIds]);
    return { childSections: childIds.length, topics: topicCount };
  },

  /** Deletes a section and its sub-sections. Their topics are kept, moved to "No section". */
  async deleteSection(ctx: RequestContext, input: { id: string }) {
    assertCanWrite(ctx);
    const ok = await repo.deleteSection(getDb(), ctx.workspaceId, input.id);
    if (!ok) throw notFound("That section");
    return { id: input.id };
  },

  // ── topics ────────────────────────────────────────────────────────────────
  async createTopic(ctx: RequestContext, input: In<typeof createTopicSchema>) {
    assertCanWrite(ctx);
    await requireSubject(ctx, input.subjectId);
    const sectionId = input.sectionId ?? null;
    if (sectionId) {
      const section = await requireSection(ctx, sectionId);
      if (section.subjectId !== input.subjectId)
        throw new AppError("VALIDATION", "That section belongs to another subject.");
    }
    return getDb().transaction(async (tx) => {
      const siblings = await repo.listSiblingTopics(tx, ctx.workspaceId, input.subjectId, sectionId);
      const id = newId();
      await repo.insertTopic(tx, {
        id,
        workspaceId: ctx.workspaceId,
        subjectId: input.subjectId,
        sectionId,
        name: input.name,
        description: input.description ?? null,
        position: nextPosition(siblings),
      });
      return { id };
    });
  },

  async updateTopic(ctx: RequestContext, input: In<typeof updateTopicSchema>) {
    assertCanWrite(ctx);
    const topic = await requireTopic(ctx, input.id);
    const patch: { name?: string; description?: string | null; sectionId?: string | null; position?: number } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    return getDb().transaction(async (tx) => {
      if (input.sectionId !== undefined && input.sectionId !== topic.sectionId) {
        if (input.sectionId) {
          const section = await repo.findSection(tx, ctx.workspaceId, input.sectionId);
          if (!section) throw notFound("That section");
          if (section.subjectId !== topic.subjectId) {
            throw new AppError("VALIDATION", "That section belongs to another subject.");
          }
        }
        const siblings = await repo.listSiblingTopics(tx, ctx.workspaceId, topic.subjectId, input.sectionId);
        patch.sectionId = input.sectionId;
        patch.position = nextPosition(siblings);
      }
      await repo.updateTopic(tx, ctx.workspaceId, topic.id, patch);
      return { id: topic.id };
    });
  },

  async moveTopic(ctx: RequestContext, input: In<typeof moveSchema>) {
    assertCanWrite(ctx);
    const topic = await requireTopic(ctx, input.id);
    return getDb().transaction(async (tx) => {
      const siblings = await repo.listSiblingTopics(tx, ctx.workspaceId, topic.subjectId, topic.sectionId);
      const changes = moveWithin(siblings, topic.id, input.direction);
      if (changes.length === 0) return { id: topic.id, moved: false };
      for (const c of changes) await repo.updateTopic(tx, ctx.workspaceId, c.id, { position: c.position });
      return { id: topic.id, moved: true };
    });
  },

  async deleteTopic(ctx: RequestContext, input: { id: string }) {
    assertCanWrite(ctx);
    const ok = await repo.deleteTopic(getDb(), ctx.workspaceId, input.id);
    if (!ok) throw notFound("That topic");
    return { id: input.id };
  },
};
