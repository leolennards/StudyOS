import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { knowledgeService } from "@/server/modules/knowledge/service";
import type { NoteNode } from "@/server/modules/notes/domain/content";
import { notesService } from "@/server/modules/notes/service";
import { searchService } from "@/server/modules/search/service";
import { closeDb } from "@/server/platform/db/client";
import { stopBoss } from "@/server/platform/jobs";
import { closeOcr } from "@/server/platform/ocr";
import { createTestUser, resetDatabase, resetJobs } from "../helpers/db";
import { uploadFixture } from "../helpers/documents";

let student: Awaited<ReturnType<typeof createTestUser>>;
let biology: string;
let history: string;

const doc = (...paragraphs: string[]): NoteNode => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

async function note(subjectId: string, title: string, ...paragraphs: string[]) {
  const { id } = await notesService.createNote(student, { subjectId });
  await notesService.saveNote(student, { id, revision: 1, title, content: doc(...paragraphs) });
  return id;
}

const highlighted = (snippet: { text: string; match: boolean }[]) => snippet.filter((p) => p.match).map((p) => p.text);

beforeEach(async () => {
  await resetDatabase();
  await resetJobs();
  student = await createTestUser();
  const subject = (name: string) =>
    knowledgeService.createSubject(student, { name, code: null, term: null, description: null, colour: "teal" });
  ({ id: biology } = await subject("Cell Biology"));
  ({ id: history } = await subject("Modern History"));
});

afterAll(async () => {
  await closeOcr();
  await stopBoss();
  await closeDb();
});

describe("searching notes", () => {
  it("finds words in a note's text as they are typed, with a highlighted snippet", async () => {
    const id = await note(biology, "Organelles", "Mitochondria release energy through respiration.");
    await note(biology, "Membranes", "The phospholipid bilayer.");

    const results = await searchService.search(student, { q: "mitoch" });
    expect(results.notes.map((n) => n.id)).toEqual([id]);
    expect(results.notes[0]).toMatchObject({ title: "Organelles", subjectId: biology });
    expect(highlighted(results.notes[0]!.snippet)).toEqual(["Mitochondria"]);
  });

  it("matches stemmed words, phrases and exclusions", async () => {
    const a = await note(biology, "Respiration", "Cells respire to release energy.");
    const b = await note(biology, "Photosynthesis", "Plants capture light energy.");

    expect((await searchService.search(student, { q: "releasing" })).notes.map((n) => n.id)).toEqual([a]);
    expect((await searchService.search(student, { q: '"light energy"' })).notes.map((n) => n.id)).toEqual([b]);
    expect((await searchService.search(student, { q: "energy -plants" })).notes.map((n) => n.id)).toEqual([a]);
  });

  it("ranks a title match above a match in the text", async () => {
    const inText = await note(biology, "Week 3", "We also touched on osmosis briefly.");
    const inTitle = await note(biology, "Osmosis", "Water moves across a membrane.");
    expect((await searchService.search(student, { q: "osmosis" })).notes.map((n) => n.id)).toEqual([inTitle, inText]);
  });

  it("tolerates a typo in a title", async () => {
    const id = await note(biology, "Photosynthesis", "");
    expect((await searchService.search(student, { q: "photosynthsis" })).notes.map((n) => n.id)).toEqual([id]);
  });

  it("finds LaTeX inside maths", async () => {
    const { id } = await notesService.createNote(student, { subjectId: biology });
    await notesService.saveNote(student, {
      id,
      revision: 1,
      title: "Growth",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "inlineMath", attrs: { latex: "N(t) = N_0 e^{rt}" } }] }],
      },
    });
    expect((await searchService.search(student, { q: "N_0" })).notes.map((n) => n.id)).toEqual([id]);
  });

  it("leaves out notes in the trash", async () => {
    const id = await note(biology, "Ribosomes", "Protein synthesis.");
    await notesService.trashNote(student, { id });
    expect((await searchService.search(student, { q: "ribosomes" })).notes).toEqual([]);
  });

  it("can be limited to one subject", async () => {
    await note(biology, "Revolution in genetics", "");
    const h = await note(history, "French Revolution", "");
    const results = await searchService.search(student, { q: "revolution", subjectId: history });
    expect(results.notes.map((n) => n.id)).toEqual([h]);
    expect(results.subjects).toEqual([]);
  });
});

describe("searching documents", () => {
  it("finds words in a document's extracted text and links to the page", async () => {
    const id = await uploadFixture(student, biology, "lecture.pdf");
    const results = await searchService.search(student, { q: "mitochondria" });
    expect(results.documents).toHaveLength(1);
    expect(results.documents[0]).toMatchObject({ id, title: "lecture", subjectId: biology, format: "pdf" });
    const [page] = results.documents[0]!.pages;
    expect(page!.pageNumber).toBeGreaterThanOrEqual(1);
    expect(highlighted(page!.snippet).map((t) => t.toLowerCase())).toContain("mitochondria");
  });

  it("finds a document by its title", async () => {
    const id = await uploadFixture(student, history, "reading.txt");
    const results = await searchService.search(student, { q: "readin" });
    expect(results.documents.map((d) => d.id)).toEqual([id]);
  });

  it("finds text in a plain text document", async () => {
    const id = await uploadFixture(student, history, "reading.txt");
    const results = await searchService.search(student, { q: "estates general" });
    expect(results.documents.map((d) => d.id)).toEqual([id]);
    expect(results.documents[0]!.pages[0]!.pageNumber).toBe(1);
  });

  it("does not search documents that are not processed yet", async () => {
    await uploadFixture(student, history, "reading.txt", { process: false });
    expect((await searchService.search(student, { q: "versailles" })).documents).toEqual([]);
  });
});

describe("searching subjects and topics", () => {
  it("finds subjects and topics by name", async () => {
    const topic = await knowledgeService.createTopic(student, {
      subjectId: biology,
      sectionId: null,
      name: "Cell division",
      description: null,
    });
    const results = await searchService.search(student, { q: "cell" });
    expect(results.subjects.map((s) => s.name)).toEqual(["Cell Biology"]);
    expect(results.topics).toEqual([
      expect.objectContaining({ id: topic.id, name: "Cell division", subjectId: biology, subjectName: "Cell Biology" }),
    ]);
  });
});

describe("queries", () => {
  it("returns nothing for queries too short or with nothing to search", async () => {
    await note(biology, "A", "a b c");
    for (const q of ["", " ", "a", "!!", "&|"]) {
      expect(await searchService.search(student, { q })).toMatchObject({
        subjects: [],
        topics: [],
        notes: [],
        cards: [],
        documents: [],
      });
    }
  });

  it("treats tsquery and LIKE syntax as plain text", async () => {
    const id = await note(biology, "100% yield", "Using a_b and (c|d) & !e:*");
    for (const q of ["100%", "a_b", "(c|d) & !e:*", "'; drop table notes; --"]) {
      const results = await searchService.search(student, { q });
      if (q === "100%" || q === "a_b") expect(results.notes.map((n) => n.id)).toEqual([id]);
    }
    expect((await searchService.search(student, { q: "%" })).notes).toEqual([]);
  });
});
