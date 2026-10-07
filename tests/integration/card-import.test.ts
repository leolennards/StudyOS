import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { assessmentService } from "@/server/modules/assessment/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { closeDb } from "@/server/platform/db/client";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let cells: string;

const NOW = new Date("2026-10-07T15:00:00Z");

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

async function subject(ctx = student, name = "Biology") {
  const { id } = await knowledgeService.createSubject(ctx, {
    name,
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  });
  return id;
}

const basic = (front: string, back: string) => ({ type: "basic" as const, front, back });

function send(
  importId: string,
  cards: { type: "basic" | "reverse" | "cloze"; front: string; back: string }[],
  extra: { subjectId?: string; topicId?: string } = {},
  ctx = student,
) {
  return flashcardsService.importCards(
    ctx,
    {
      importId,
      subjectId: extra.subjectId ?? subjectId,
      source: "anki",
      name: "Biology.apkg",
      topicId: extra.topicId,
      cards,
    },
    NOW,
  );
}

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  subjectId = await subject();
  const { id } = await knowledgeService.createTopic(student, {
    subjectId,
    sectionId: null,
    name: "Cells",
    description: null,
  });
  cells = id;
  await flashcardsService.createCard(student, { ...basic("Powerhouse of the cell", "Mitochondria"), subjectId });
});

afterAll(async () => {
  await closeDb();
});

describe("importing cards", () => {
  it("adds new cards in file order, skipping ones the subject has and ones that can't be saved", async () => {
    const importId = randomUUID();
    const result = await send(
      importId,
      [
        basic("Makes proteins", "Ribosome"),
        { type: "reverse", front: "chien", back: "dog" },
        { type: "cloze", front: "{{c1::Mitosis}} makes two {{c2::identical}} cells", back: "" },
        // Already in the subject, once trimmed.
        basic(" Powerhouse of the cell ", "Mitochondria"),
        // Twice in one batch.
        basic("Makes proteins", "Ribosome"),
        // A cloze card with no deletions can't be saved.
        { type: "cloze", front: "No deletions here", back: "" },
      ],
      { topicId: cells },
    );
    expect(result).toEqual({ added: 3, duplicates: 2, invalid: 1 });

    // Sending the same batch again, as after a dropped connection, adds nothing.
    expect(await send(importId, [basic("Makes proteins", "Ribosome")], { topicId: cells })).toEqual({
      added: 0,
      duplicates: 1,
      invalid: 0,
    });

    const { cards } = await flashcardsService.listCards(student, { subjectId, topicId: cells }, NOW);
    expect(cards.map((c) => c.front)).toEqual([
      "{{c1::Mitosis}} makes two {{c2::identical}} cells",
      "chien",
      "Makes proteins",
    ]);
    expect(cards.map((c) => c.items.length)).toEqual([2, 2, 1]);
    expect(cards.every((c) => c.isNew && c.topics[0]?.name === "Cells")).toBe(true);

    // New cards are introduced for review in the order they were in the file.
    const session = await flashcardsService.getSession(student, { subjectId }, NOW);
    expect(session.items.map((i) => i.front).filter((f) => f !== "Powerhouse of the cell")).toEqual([
      "Makes proteins",
      "chien",
      "{{c1::Mitosis}} makes two {{c2::identical}} cells",
    ]);

    expect(await flashcardsService.listImports(student, subjectId)).toEqual([
      { id: importId, source: "anki", name: "Biology.apkg", createdAt: NOW, cards: 3, reviewed: 0 },
    ]);
  });

  it("takes an import back, deleting only its cards and their history", async () => {
    const importId = randomUUID();
    await send(importId, [basic("Makes proteins", "Ribosome"), basic("Unit of heredity", "Gene")]);
    const { cards } = await flashcardsService.listCards(student, { subjectId }, NOW);
    const gene = cards.find((c) => c.front === "Unit of heredity")!;
    await flashcardsService.reviewCard(
      student,
      { reviewId: randomUUID(), cardId: gene.id, ordinal: 0, rating: 3 },
      NOW,
    );
    // A quiz that asks an imported card loses that question with it.
    await assessmentService.startQuiz(student, { subjectId, count: 10, format: "typed" }, NOW);

    expect(await flashcardsService.listImports(student, subjectId)).toMatchObject([{ cards: 2, reviewed: 1 }]);
    await flashcardsService.deleteImport(student, { id: importId });
    const left = await flashcardsService.listCards(student, { subjectId }, NOW);
    expect(left.cards.map((c) => c.front)).toEqual(["Powerhouse of the cell"]);
    expect(await flashcardsService.listImports(student, subjectId)).toEqual([]);
    expect(await code(() => flashcardsService.deleteImport(student, { id: importId }))).toBe("NOT_FOUND");
  });

  it("keeps an import to its subject, and topics to theirs", async () => {
    const importId = randomUUID();
    await send(importId, [basic("a", "b")]);
    const chemistry = await subject(student, "Chemistry");
    expect(await code(() => send(importId, [basic("c", "d")], { subjectId: chemistry }))).toBe("CONFLICT");
    expect(await code(() => send(randomUUID(), [basic("c", "d")], { subjectId: chemistry, topicId: cells }))).toBe(
      "VALIDATION",
    );
  });
});

describe("access", () => {
  it("viewers can't import or take an import back", async () => {
    const importId = randomUUID();
    await send(importId, [basic("a", "b")]);
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => send(randomUUID(), [basic("c", "d")], {}, viewer))).toBe("FORBIDDEN");
    expect(await code(() => flashcardsService.deleteImport(viewer, { id: importId }))).toBe("FORBIDDEN");
    expect(await code(() => flashcardsService.listImports(viewer, subjectId))).toBe("OK");
  });

  it("keeps each workspace's imports to itself", async () => {
    const importId = randomUUID();
    await send(importId, [basic("a", "b")]);
    const bob = await createTestUser("Bob");
    const bobs = await subject(bob, "Bob's subject");
    expect(await code(() => send(randomUUID(), [basic("c", "d")], {}, bob))).toBe("NOT_FOUND");
    // Bob can't add to Alice's import by reusing its id.
    expect(await code(() => send(importId, [basic("c", "d")], { subjectId: bobs }, bob))).toBe("CONFLICT");
    expect(await code(() => flashcardsService.deleteImport(bob, { id: importId }))).toBe("NOT_FOUND");
    expect(await code(() => flashcardsService.listImports(bob, subjectId))).toBe("NOT_FOUND");
    expect(await flashcardsService.listImports(student, subjectId)).toHaveLength(1);
  });
});
