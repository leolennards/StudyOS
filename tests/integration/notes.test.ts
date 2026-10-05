import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { knowledgeService } from "@/server/modules/knowledge/service";
import type { NoteNode } from "@/server/modules/notes/domain/content";
import { notesService } from "@/server/modules/notes/service";
import { closeDb, getDb } from "@/server/platform/db/client";
import { notes } from "@/server/platform/db/schema";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let sectionId: string;
let topicId: string;

const doc = (...paragraphs: string[]): NoteNode => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  ({ id: subjectId } = await knowledgeService.createSubject(student, {
    name: "Physics",
    code: null,
    term: null,
    description: null,
    colour: "sky",
  }));
  ({ id: sectionId } = await knowledgeService.createSection(student, { subjectId, label: "Week", title: "One" }));
  ({ id: topicId } = await knowledgeService.createTopic(student, {
    subjectId,
    sectionId,
    name: "Entropy",
    description: null,
  }));
});

afterAll(async () => {
  await closeDb();
});

describe("creating and saving notes", () => {
  it("creates an empty note in a section with topics", async () => {
    const { id } = await notesService.createNote(student, { subjectId, sectionId, topicIds: [topicId] });
    const note = await notesService.getNote(student, id);
    expect(note).toMatchObject({ subjectId, sectionId, title: "", revision: 1, topicIds: [topicId], deletedAt: null });
    expect(note.content).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(await notesService.countNotes(student, subjectId)).toBe(1);
  });

  it("saves content, derives the text on the server and bumps the revision", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    const saved = await notesService.saveNote(student, {
      id,
      revision: 1,
      title: "Second law",
      content: doc("Entropy never decreases.", "In an isolated system."),
    });
    expect(saved.revision).toBe(2);
    const note = await notesService.getNote(student, id);
    expect(note).toMatchObject({ title: "Second law", wordCount: 7, revision: 2 });
    const [row] = await getDb().select({ text: notes.contentText }).from(notes);
    expect(row!.text).toBe("Entropy never decreases.\nIn an isolated system.");
  });

  it("refuses a save based on an older revision instead of overwriting", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    await notesService.saveNote(student, { id, revision: 1, title: "Tab one", content: doc("first") });
    expect(
      await code(() => notesService.saveNote(student, { id, revision: 1, title: "Tab two", content: doc("second") })),
    ).toBe("CONFLICT");
    expect((await notesService.getNote(student, id)).title).toBe("Tab one");
  });

  it("refuses content the editor could not have produced", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    const bad = [
      { type: "doc", content: [{ type: "script" }] },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
          },
        ],
      },
      "not a document",
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(1_000_001) }] }] },
    ];
    for (const content of bad) {
      expect(await code(() => notesService.saveNote(student, { id, revision: 1, title: "", content }))).toBe(
        "VALIDATION",
      );
    }
    expect((await notesService.getNote(student, id)).revision).toBe(1);
  });

  it("lists notes newest first with an excerpt and their topics", async () => {
    const a = await notesService.createNote(student, { subjectId, topicIds: [topicId] });
    const b = await notesService.createNote(student, { subjectId });
    await notesService.saveNote(student, {
      id: a.id,
      revision: 1,
      title: "Older",
      content: doc("Heat flows from hot to cold."),
    });
    await notesService.saveNote(student, {
      id: b.id,
      revision: 1,
      title: "",
      content: doc("Untitled but edited last."),
    });
    const list = await notesService.listNotes(student, subjectId);
    expect(list.map((n) => n.title)).toEqual(["Untitled note", "Older"]);
    expect(list[1]).toMatchObject({
      excerpt: "Heat flows from hot to cold.",
      topics: [{ id: topicId, name: "Entropy" }],
    });
  });
});

describe("sections and topics", () => {
  it("moves a note between sections of its own subject only", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    await notesService.moveNote(student, { id, sectionId });
    expect((await notesService.getNote(student, id)).sectionId).toBe(sectionId);
    await notesService.moveNote(student, { id, sectionId: null });
    expect((await notesService.getNote(student, id)).sectionId).toBeNull();

    const other = await knowledgeService.createSubject(student, {
      name: "Maths",
      code: null,
      term: null,
      description: null,
      colour: "rose",
    });
    const otherSection = await knowledgeService.createSection(student, {
      subjectId: other.id,
      label: "Week",
      title: "One",
    });
    expect(await code(() => notesService.moveNote(student, { id, sectionId: otherSection.id }))).toBe("VALIDATION");
    expect(await code(() => notesService.createNote(student, { subjectId, sectionId: otherSection.id }))).toBe(
      "VALIDATION",
    );
  });

  it("links topics of its own subject only", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    await notesService.setTopics(student, { id, topicIds: [topicId, topicId] });
    expect((await notesService.getNote(student, id)).topicIds).toEqual([topicId]);

    const other = await knowledgeService.createSubject(student, {
      name: "Maths",
      code: null,
      term: null,
      description: null,
      colour: "rose",
    });
    const otherTopic = await knowledgeService.createTopic(student, {
      subjectId: other.id,
      sectionId: null,
      name: "Limits",
      description: null,
    });
    expect(await code(() => notesService.setTopics(student, { id, topicIds: [otherTopic.id] }))).toBe("VALIDATION");
  });

  it("keeps the note when its section or topic is deleted", async () => {
    const { id } = await notesService.createNote(student, { subjectId, sectionId, topicIds: [topicId] });
    await knowledgeService.deleteTopic(student, { id: topicId });
    await knowledgeService.deleteSection(student, { id: sectionId });
    expect(await notesService.getNote(student, id)).toMatchObject({ sectionId: null, topicIds: [] });
  });

  it("deletes a subject's notes with the subject", async () => {
    await notesService.createNote(student, { subjectId });
    await knowledgeService.deleteSubject(student, { id: subjectId, confirmName: "Physics" });
    expect(await notesService.countNotes(student)).toBe(0);
  });
});

describe("trash", () => {
  it("trashes, restores and only deletes for good from the trash", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    expect(await code(() => notesService.deleteNote(student, { id }))).toBe("VALIDATION");

    await notesService.trashNote(student, { id });
    expect(await notesService.listNotes(student, subjectId)).toHaveLength(0);
    expect(await notesService.countNotes(student, subjectId)).toBe(0);
    const [trashed] = await notesService.listTrash(student, subjectId);
    expect(trashed!.id).toBe(id);
    expect(trashed!.purgeAt.getTime() - trashed!.deletedAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);

    // A trashed note can't be edited until it is restored.
    expect(await code(() => notesService.saveNote(student, { id, revision: 1, title: "x", content: doc("x") }))).toBe(
      "VALIDATION",
    );
    await notesService.restoreNote(student, { id });
    expect(await notesService.listNotes(student, subjectId)).toHaveLength(1);

    await notesService.trashNote(student, { id });
    await notesService.deleteNote(student, { id });
    expect(await code(() => notesService.getNote(student, id))).toBe("NOT_FOUND");
  });

  it("empties a subject's trash and leaves its other notes", async () => {
    const keep = await notesService.createNote(student, { subjectId });
    const a = await notesService.createNote(student, { subjectId });
    const b = await notesService.createNote(student, { subjectId });
    await notesService.trashNote(student, { id: a.id });
    await notesService.trashNote(student, { id: b.id });
    expect((await notesService.emptyTrash(student, { subjectId })).deleted).toBe(2);
    expect((await notesService.listNotes(student, subjectId)).map((n) => n.id)).toEqual([keep.id]);
  });

  it("purges notes trashed more than 30 days ago", async () => {
    const old = await notesService.createNote(student, { subjectId });
    const recent = await notesService.createNote(student, { subjectId });
    await notesService.trashNote(student, { id: old.id });
    await notesService.trashNote(student, { id: recent.id });
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    await getDb()
      .update(notes)
      .set({ deletedAt: daysAgo(31) })
      .where(eq(notes.id, old.id));
    await getDb()
      .update(notes)
      .set({ deletedAt: daysAgo(29) })
      .where(eq(notes.id, recent.id));

    expect(await notesService.systemPurgeTrash()).toBe(1);
    expect(await code(() => notesService.getNote(student, old.id))).toBe("NOT_FOUND");
    expect(await code(() => notesService.getNote(student, recent.id))).toBe("OK");
  });
});

describe("permissions", () => {
  it("a viewer can read but not write", async () => {
    const { id } = await notesService.createNote(student, { subjectId });
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => notesService.getNote(viewer, id))).toBe("OK");
    expect(await code(() => notesService.createNote(viewer, { subjectId }))).toBe("FORBIDDEN");
    expect(await code(() => notesService.saveNote(viewer, { id, revision: 1, title: "", content: doc("x") }))).toBe(
      "FORBIDDEN",
    );
    expect(await code(() => notesService.trashNote(viewer, { id }))).toBe("FORBIDDEN");
  });
});
