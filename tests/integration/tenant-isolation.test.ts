import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/platform/db/client";
import { isAppError } from "@/server/lib/errors";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { settingsService } from "@/server/modules/settings/service";
import { libraryService } from "@/server/modules/library/service";
import { notesService } from "@/server/modules/notes/service";
import { searchService } from "@/server/modules/search/service";
import { stopBoss } from "@/server/platform/jobs";
import { closeOcr } from "@/server/platform/ocr";
import { getStorage } from "@/server/platform/storage";
import { createTestUser, resetDatabase } from "../helpers/db";
import { fixture, sha256, uploadFixture } from "../helpers/documents";

/**
 * The most important test in StudyOS: user B must never reach user A's data,
 * through any read or write of any service (Architecture §7).
 * Every new module adds its reads and writes to this suite.
 */

let alice: Awaited<ReturnType<typeof createTestUser>>;
let bob: Awaited<ReturnType<typeof createTestUser>>;
let aliceData: { subjectId: string; sectionId: string; topicId: string };

beforeEach(async () => {
  await resetDatabase();
  alice = await createTestUser("Alice");
  bob = await createTestUser("Bob");

  const subject = await knowledgeService.createSubject(alice, {
    name: "Alice's Chemistry",
    code: null,
    term: null,
    description: null,
    colour: "teal",
  });
  const section = await knowledgeService.createSection(alice, {
    subjectId: subject.id,
    label: "Week",
    title: "Alice's week",
  });
  const topic = await knowledgeService.createTopic(alice, {
    subjectId: subject.id,
    sectionId: section.id,
    name: "Alice's topic",
    description: null,
  });
  aliceData = { subjectId: subject.id, sectionId: section.id, topicId: topic.id };
});

afterAll(async () => {
  await closeOcr();
  await stopBoss();
  await closeDb();
});

/** Asserts that Bob cannot see Alice's data: NOT_FOUND, never her content. */
async function denied(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "LEAKED";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

describe("reads are scoped to the workspace", () => {
  it("Bob's subject list is empty while Alice has one", async () => {
    expect(await knowledgeService.listSubjects(bob)).toEqual([]);
    expect(await knowledgeService.listSubjects(bob, { archived: true })).toEqual([]);
    expect(await knowledgeService.listSubjects(alice)).toHaveLength(1);
  });

  it("Bob cannot read Alice's subject by id", async () => {
    expect(await denied(() => knowledgeService.getSubject(bob, aliceData.subjectId))).toBe("NOT_FOUND");
    expect(await denied(() => knowledgeService.getSubjectTree(bob, aliceData.subjectId))).toBe("NOT_FOUND");
  });

  it("Bob cannot read the delete impact of Alice's section", async () => {
    expect(await denied(() => knowledgeService.sectionDeleteImpact(bob, aliceData.sectionId))).toBe("NOT_FOUND");
  });

  it("subject counts never include another workspace's rows", async () => {
    await knowledgeService.createSubject(bob, {
      name: "Bob's Physics",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const [bobSubject] = await knowledgeService.listSubjects(bob);
    expect(bobSubject).toMatchObject({ name: "Bob's Physics", sectionCount: 0, topicCount: 0 });
    expect(await knowledgeService.countActiveSubjects(bob)).toBe(1);
    expect(await knowledgeService.countActiveSubjects(alice)).toBe(1);
  });
});

describe("writes cannot touch another workspace", () => {
  it("Bob cannot update, archive or delete Alice's subject", async () => {
    expect(await denied(() => knowledgeService.updateSubject(bob, { id: aliceData.subjectId, name: "Hacked" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await denied(() => knowledgeService.setSubjectArchived(bob, { id: aliceData.subjectId, archived: true })),
    ).toBe("NOT_FOUND");
    expect(
      await denied(() =>
        knowledgeService.deleteSubject(bob, { id: aliceData.subjectId, confirmName: "Alice's Chemistry" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("Bob cannot add a section or topic to Alice's subject", async () => {
    expect(
      await denied(() =>
        knowledgeService.createSection(bob, { subjectId: aliceData.subjectId, label: "Week", title: "Intruder" }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await denied(() =>
        knowledgeService.createTopic(bob, {
          subjectId: aliceData.subjectId,
          sectionId: null,
          name: "Intruder",
          description: null,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("Bob cannot edit, move or delete Alice's section", async () => {
    expect(await denied(() => knowledgeService.updateSection(bob, { id: aliceData.sectionId, title: "Hacked" }))).toBe(
      "NOT_FOUND",
    );
    expect(await denied(() => knowledgeService.moveSection(bob, { id: aliceData.sectionId, direction: "up" }))).toBe(
      "NOT_FOUND",
    );
    expect(await denied(() => knowledgeService.deleteSection(bob, { id: aliceData.sectionId }))).toBe("NOT_FOUND");
  });

  it("Bob cannot edit, move or delete Alice's topic", async () => {
    expect(await denied(() => knowledgeService.updateTopic(bob, { id: aliceData.topicId, name: "Hacked" }))).toBe(
      "NOT_FOUND",
    );
    expect(await denied(() => knowledgeService.moveTopic(bob, { id: aliceData.topicId, direction: "up" }))).toBe(
      "NOT_FOUND",
    );
    expect(await denied(() => knowledgeService.deleteTopic(bob, { id: aliceData.topicId }))).toBe("NOT_FOUND");
  });

  it("Bob cannot move his own topic into Alice's section", async () => {
    const bobSubject = await knowledgeService.createSubject(bob, {
      name: "Bob's Physics",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const bobTopic = await knowledgeService.createTopic(bob, {
      subjectId: bobSubject.id,
      sectionId: null,
      name: "Bob's topic",
      description: null,
    });
    expect(
      await denied(() => knowledgeService.updateTopic(bob, { id: bobTopic.id, sectionId: aliceData.sectionId })),
    ).toBe("NOT_FOUND");
  });

  it("Alice's data is untouched after every attempt", async () => {
    const tree = await knowledgeService.getSubjectTree(alice, aliceData.subjectId);
    expect(tree.subject.name).toBe("Alice's Chemistry");
    expect(tree.subject.archivedAt).toBeNull();
    expect(tree.sections[0]!.title).toBe("Alice's week");
    expect(tree.sections[0]!.topics[0]!.name).toBe("Alice's topic");
  });
});

describe("settings are per user", () => {
  it("one user's preferences never appear for another", async () => {
    await settingsService.update(alice, { theme: "dark", timezone: "Africa/Johannesburg" });
    expect(await settingsService.get(bob)).toEqual({ theme: "system", timezone: "UTC" });
    expect(await settingsService.get(alice)).toEqual({ theme: "dark", timezone: "Africa/Johannesburg" });
  });
});

describe("documents and their files are scoped to the workspace", () => {
  let aliceDoc: string;

  beforeEach(async () => {
    aliceDoc = await uploadFixture(alice, aliceData.subjectId, "lecture.pdf");
    await libraryService.setTopics(alice, { id: aliceDoc, topicIds: [aliceData.topicId] });
  });

  it("Bob cannot list, read, or get the text of Alice's documents", async () => {
    expect(await denied(() => libraryService.listDocuments(bob, aliceData.subjectId))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.getDocument(bob, aliceDoc))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.getPages(bob, aliceDoc))).toBe("NOT_FOUND");
    expect(await libraryService.getStatuses(bob, [aliceDoc])).toEqual([]);
    expect(await libraryService.countDocuments(bob)).toBe(0);
    expect((await libraryService.storageUsage(bob)).usedBytes).toBe(0);
  });

  it("Bob cannot get a URL to view or download Alice's file", async () => {
    expect(await denied(() => libraryService.getViewUrl(bob, aliceDoc))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.getDownloadUrl(bob, aliceDoc))).toBe("NOT_FOUND");
  });

  it("Bob cannot upload into Alice's subject", async () => {
    const data = await fixture("reading.txt");
    expect(
      await denied(() =>
        libraryService.createUpload(bob, {
          subjectId: aliceData.subjectId,
          filename: "intruder.txt",
          size: data.length,
          sha256: sha256(data),
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("uploading the same file as Alice reveals nothing about hers", async () => {
    const bobSubject = await knowledgeService.createSubject(bob, {
      name: "Bob's Biology",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const bobDoc = await uploadFixture(bob, bobSubject.id, "lecture.pdf");
    expect(bobDoc).not.toBe(aliceDoc);
    expect((await libraryService.getDocument(bob, bobDoc)).status).toBe("ready");
    expect(await getStorage().list(`ws/${bob.workspaceId}/`)).toEqual([
      `ws/${bob.workspaceId}/docs/${bobDoc}/original`,
    ]);
  });

  it("Bob cannot confirm, retry, rename, re-topic or delete Alice's document", async () => {
    expect(await denied(() => libraryService.confirmUpload(bob, { id: aliceDoc }))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.retryProcessing(bob, { id: aliceDoc }))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.updateDocument(bob, { id: aliceDoc, title: "Hacked" }))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.setTopics(bob, { id: aliceDoc, topicIds: [] }))).toBe("NOT_FOUND");
    expect(await denied(() => libraryService.deleteDocument(bob, { id: aliceDoc }))).toBe("NOT_FOUND");
    const doc = await libraryService.getDocument(alice, aliceDoc);
    expect(doc).toMatchObject({ title: "lecture", topicIds: [aliceData.topicId], status: "ready" });
  });

  it("Bob cannot link Alice's topic to his own document", async () => {
    const bobSubject = await knowledgeService.createSubject(bob, {
      name: "Bob's Biology",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const bobDoc = await uploadFixture(bob, bobSubject.id, "reading.txt");
    expect(await denied(() => libraryService.setTopics(bob, { id: bobDoc, topicIds: [aliceData.topicId] }))).toBe(
      "VALIDATION",
    );
  });
});

describe("notes are scoped to the workspace", () => {
  let aliceNote: string;
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Alice's secret mnemonic" }] }],
  };

  beforeEach(async () => {
    ({ id: aliceNote } = await notesService.createNote(alice, {
      subjectId: aliceData.subjectId,
      sectionId: aliceData.sectionId,
      topicIds: [aliceData.topicId],
    }));
    await notesService.saveNote(alice, { id: aliceNote, revision: 1, title: "Alice's note", content });
  });

  it("Bob cannot list, read or count Alice's notes or her trash", async () => {
    expect(await denied(() => notesService.listNotes(bob, aliceData.subjectId))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.listTrash(bob, aliceData.subjectId))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.getNote(bob, aliceNote))).toBe("NOT_FOUND");
    expect(await notesService.countNotes(bob)).toBe(0);
  });

  it("Bob cannot create a note in Alice's subject", async () => {
    expect(await denied(() => notesService.createNote(bob, { subjectId: aliceData.subjectId }))).toBe("NOT_FOUND");
  });

  it("Bob cannot save, move, re-topic, trash, restore or delete Alice's note", async () => {
    expect(
      await denied(() => notesService.saveNote(bob, { id: aliceNote, revision: 2, title: "Hacked", content })),
    ).toBe("NOT_FOUND");
    expect(await denied(() => notesService.moveNote(bob, { id: aliceNote, sectionId: null }))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.setTopics(bob, { id: aliceNote, topicIds: [] }))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.trashNote(bob, { id: aliceNote }))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.restoreNote(bob, { id: aliceNote }))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.deleteNote(bob, { id: aliceNote }))).toBe("NOT_FOUND");
    expect(await denied(() => notesService.emptyTrash(bob, { subjectId: aliceData.subjectId }))).toBe("NOT_FOUND");
    const note = await notesService.getNote(alice, aliceNote);
    expect(note).toMatchObject({
      title: "Alice's note",
      revision: 2,
      sectionId: aliceData.sectionId,
      topicIds: [aliceData.topicId],
      deletedAt: null,
    });
  });

  it("Bob cannot file his own note under Alice's section or topic", async () => {
    const bobSubject = await knowledgeService.createSubject(bob, {
      name: "Bob's Physics",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    expect(
      await denied(() => notesService.createNote(bob, { subjectId: bobSubject.id, sectionId: aliceData.sectionId })),
    ).toBe("VALIDATION");
    const { id } = await notesService.createNote(bob, { subjectId: bobSubject.id });
    expect(await denied(() => notesService.moveNote(bob, { id, sectionId: aliceData.sectionId }))).toBe("VALIDATION");
    expect(await denied(() => notesService.setTopics(bob, { id, topicIds: [aliceData.topicId] }))).toBe("VALIDATION");
  });
});

describe("search is scoped to the workspace", () => {
  it("Bob's searches never return Alice's subjects, topics, notes or documents", async () => {
    const { id } = await notesService.createNote(alice, { subjectId: aliceData.subjectId });
    await notesService.saveNote(alice, {
      id,
      revision: 1,
      title: "Alice's chemistry note",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Mitochondria" }] }] },
    });
    await uploadFixture(alice, aliceData.subjectId, "lecture.pdf");

    for (const q of ["alice", "chemistry", "mitochondria", "topic", "lecture", "cell"]) {
      expect(await searchService.search(bob, { q })).toEqual({
        query: q,
        subjects: [],
        topics: [],
        notes: [],
        documents: [],
      });
    }
    // The same searches do find Alice's data for Alice.
    const mine = await searchService.search(alice, { q: "mitochondria" });
    expect(mine.notes).toHaveLength(1);
    expect(mine.documents).toHaveLength(1);
  });

  it("Bob cannot search inside Alice's subject", async () => {
    expect(await denied(() => searchService.search(bob, { q: "alice", subjectId: aliceData.subjectId }))).toBe(
      "NOT_FOUND",
    );
  });
});
