import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { notesService } from "@/server/modules/notes/service";
import { searchService } from "@/server/modules/search/service";
import { settingsService } from "@/server/modules/settings/service";
import { closeDb, getDb } from "@/server/platform/db/client";
import { cardReviews, cardStates } from "@/server/platform/db/schema";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;
let topicId: string;
let otherTopicId: string;

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

const basic = (front: string, back: string, extra: { topicIds?: string[] } = {}) =>
  flashcardsService.createCard(student, { subjectId, type: "basic", front, back, ...extra });

const states = (cardId: string) =>
  getDb().select().from(cardStates).where(eq(cardStates.cardId, cardId)).orderBy(cardStates.ordinal);

const rate = (cardId: string, ordinal: number, rating: 1 | 2 | 3 | 4, now: Date, reviewId = newId()) =>
  flashcardsService.reviewCard(student, { reviewId, cardId, ordinal, rating, durationMs: 4000 }, now);

beforeEach(async () => {
  await resetDatabase();
  student = await createTestUser();
  ({ id: subjectId } = await knowledgeService.createSubject(student, {
    name: "Biology",
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  }));
  ({ id: topicId } = await knowledgeService.createTopic(student, {
    subjectId,
    sectionId: null,
    name: "Cells",
    description: null,
  }));
  ({ id: otherTopicId } = await knowledgeService.createTopic(student, {
    subjectId,
    sectionId: null,
    name: "Genetics",
    description: null,
  }));
});

afterAll(async () => {
  await closeDb();
});

describe("creating cards", () => {
  it("creates one new item for basic, two for reversed and one per cloze number", async () => {
    const a = await basic("What is ATP?", "The cell's energy currency", { topicIds: [topicId] });
    const b = await flashcardsService.createCard(student, { subjectId, type: "reverse", front: "Hund", back: "Dog" });
    const c = await flashcardsService.createCard(student, {
      subjectId,
      type: "cloze",
      front: "{{c1::Mitochondria}} make {{c2::ATP}}; {{c1::they}} have DNA.",
      back: "",
    });
    expect((await states(a.id)).map((s) => [s.ordinal, s.state])).toEqual([[0, "new"]]);
    expect((await states(b.id)).map((s) => s.ordinal)).toEqual([0, 1]);
    expect((await states(c.id)).map((s) => s.ordinal)).toEqual([1, 2]);

    const card = await flashcardsService.getCard(student, a.id);
    expect(card).toMatchObject({ front: "What is ATP?", isNew: true, topics: [{ id: topicId, name: "Cells" }] });
    expect(await flashcardsService.countCards(student, subjectId)).toBe(3);
  });

  it("trims text and refuses cards that can't be asked", async () => {
    expect(await code(() => basic("Front", "   "))).toBe("VALIDATION");
    expect(await code(() => basic("", "Back"))).toBe("VALIDATION");
    expect(
      await code(() =>
        flashcardsService.createCard(student, { subjectId, type: "cloze", front: "No deletions", back: "" }),
      ),
    ).toBe("VALIDATION");
    const { id } = await basic("  Q  ", "  A ");
    expect(await flashcardsService.getCard(student, id)).toMatchObject({ front: "Q", back: "A" });
  });

  it("only links topics and sources from the same subject", async () => {
    const other = await knowledgeService.createSubject(student, {
      name: "Chemistry",
      code: null,
      term: null,
      description: null,
      colour: "sky",
    });
    const foreignTopic = await knowledgeService.createTopic(student, {
      subjectId: other.id,
      sectionId: null,
      name: "Bonds",
      description: null,
    });
    expect(await code(() => basic("Q", "A", { topicIds: [foreignTopic.id] }))).toBe("VALIDATION");

    const foreignNote = await notesService.createNote(student, { subjectId: other.id });
    expect(
      await code(() =>
        flashcardsService.createCard(student, {
          subjectId,
          type: "basic",
          front: "Q",
          back: "A",
          sourceNoteId: foreignNote.id,
        }),
      ),
    ).toBe("VALIDATION");
  });

  it("remembers the note a card came from, and forgets it when the note is deleted", async () => {
    const note = await notesService.createNote(student, { subjectId });
    await notesService.saveNote(student, {
      id: note.id,
      revision: 1,
      title: "Lecture 3",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ATP" }] }] },
    });
    const { id } = await flashcardsService.createCard(student, {
      subjectId,
      type: "basic",
      front: "ATP?",
      back: "Energy",
      sourceNoteId: note.id,
    });
    expect((await flashcardsService.getCard(student, id)).source).toEqual({
      kind: "note",
      id: note.id,
      title: "Lecture 3",
    });

    await notesService.trashNote(student, { id: note.id });
    await notesService.deleteNote(student, { id: note.id });
    expect((await flashcardsService.getCard(student, id)).source).toBeNull();
  });

  it("refuses writes from a viewer", async () => {
    const viewer = { ...student, role: "viewer" as const };
    expect(
      await code(() => flashcardsService.createCard(viewer, { subjectId, type: "basic", front: "Q", back: "A" })),
    ).toBe("FORBIDDEN");
  });
});

describe("editing cards", () => {
  it("keeps the schedule of items that remain and starts new ones fresh", async () => {
    const now = new Date();
    const { id } = await flashcardsService.createCard(student, {
      subjectId,
      type: "cloze",
      front: "{{c1::A}} and {{c2::B}}",
      back: "",
    });
    await rate(id, 1, 4, now);
    await rate(id, 2, 4, now);

    await flashcardsService.updateCard(student, { id, type: "cloze", front: "{{c1::A}} and {{c3::C}}", back: "" });
    const after = await states(id);
    expect(after.map((s) => [s.ordinal, s.state])).toEqual([
      [1, "review"],
      [3, "new"],
    ]);
    // The removed deletion's history goes with it; the kept one's stays.
    const reviews = await getDb().select().from(cardReviews).where(eq(cardReviews.cardId, id));
    expect(reviews.map((r) => r.ordinal)).toEqual([1]);
  });

  it("adds the reverse direction when a basic card is made reversible, and changes topics", async () => {
    const { id } = await basic("Hund", "Dog", { topicIds: [topicId] });
    await flashcardsService.updateCard(student, {
      id,
      type: "reverse",
      front: "Hund",
      back: "Dog",
      topicIds: [otherTopicId],
    });
    expect((await states(id)).map((s) => s.ordinal)).toEqual([0, 1]);
    expect((await flashcardsService.getCard(student, id)).topics.map((t) => t.id)).toEqual([otherTopicId]);
  });
});

describe("the card list", () => {
  it("filters by topic and shows each card's schedule", async () => {
    const now = new Date();
    const cells = await basic("Cells?", "Units of life", { topicIds: [topicId] });
    await basic("Genes?", "Units of heredity", { topicIds: [otherTopicId] });
    await rate(cells.id, 0, 4, now);

    const all = await flashcardsService.listCards(student, { subjectId }, now);
    expect(all.cards).toHaveLength(2);
    const onCells = await flashcardsService.listCards(student, { subjectId, topicId }, now);
    expect(onCells.cards.map((c) => c.front)).toEqual(["Cells?"]);
    expect(onCells.cards[0]).toMatchObject({ isNew: false });
    expect(onCells.cards[0]!.nextDue!.getTime()).toBeGreaterThan(now.getTime());
    expect(onCells.cards[0]!.items[0]!.retrievability).toBeGreaterThan(0.9);
  });
});

describe("reviewing", () => {
  it("reschedules an item and logs the rating", async () => {
    const now = new Date();
    const { id } = await basic("Q", "A");
    const result = await rate(id, 0, 3, now);
    expect(result).toMatchObject({ state: "learning", duplicate: false });
    expect(result.due.getTime() - now.getTime()).toBe(10 * 60_000);

    const [log] = await getDb().select().from(cardReviews).where(eq(cardReviews.cardId, id));
    expect(log).toMatchObject({ rating: 3, stateBefore: "new", durationMs: 4000, elapsedDays: 0 });
  });

  it("records a retried rating once", async () => {
    const now = new Date();
    const { id } = await basic("Q", "A");
    const reviewId = newId();
    await rate(id, 0, 3, now, reviewId);
    const again = await rate(id, 0, 3, new Date(now.getTime() + 1000), reviewId);
    expect(again.duplicate).toBe(true);
    const logs = await getDb().select().from(cardReviews).where(eq(cardReviews.cardId, id));
    expect(logs).toHaveLength(1);
    expect((await states(id))[0]!.reps).toBe(1);
  });

  it("undoes the latest rating, and only the latest", async () => {
    const now = new Date();
    const { id } = await basic("Q", "A");
    const before = (await states(id))[0]!;
    const first = newId();
    await rate(id, 0, 3, now, first);
    const second = newId();
    await rate(id, 0, 3, new Date(now.getTime() + 11 * 60_000), second);

    expect(await code(() => flashcardsService.undoReview(student, { reviewId: first }))).toBe("VALIDATION");
    await flashcardsService.undoReview(student, { reviewId: second });
    await flashcardsService.undoReview(student, { reviewId: first });
    const restored = (await states(id))[0]!;
    expect(restored).toMatchObject({ state: "new", reps: 0, stability: before.stability });
    expect(restored.due.getTime()).toBe(before.due.getTime());
    expect(await getDb().select().from(cardReviews).where(eq(cardReviews.cardId, id))).toHaveLength(0);
  });

  it("won't review a suspended card, and leaves it out of sessions", async () => {
    const { id } = await basic("Q", "A");
    await flashcardsService.setSuspended(student, { id, suspended: true });
    expect(await code(() => rate(id, 0, 3, new Date()))).toBe("VALIDATION");
    expect((await flashcardsService.getSession(student, { subjectId })).items).toHaveLength(0);
    await flashcardsService.setSuspended(student, { id, suspended: false });
    expect((await flashcardsService.getSession(student, { subjectId })).items).toHaveLength(1);
  });

  it("deletes a card with its schedule and history", async () => {
    const { id } = await basic("Q", "A");
    await rate(id, 0, 3, new Date());
    await flashcardsService.deleteCard(student, { id });
    expect(await states(id)).toHaveLength(0);
    expect(await getDb().select().from(cardReviews).where(eq(cardReviews.cardId, id))).toHaveLength(0);
    expect(await code(() => flashcardsService.getCard(student, id))).toBe("NOT_FOUND");
  });
});

describe("review sessions", () => {
  it("starts only one new item per card in a session", async () => {
    await flashcardsService.createCard(student, { subjectId, type: "reverse", front: "Hund", back: "Dog" });
    const session = await flashcardsService.getSession(student, { subjectId });
    expect(session.items.map((i) => i.ordinal)).toEqual([0]);
  });

  it("respects the daily new-card limit in the student's time zone", async () => {
    await settingsService.update(student, { newCardsPerDay: 2, timezone: "Asia/Tokyo" });
    for (const n of [1, 2, 3, 4]) await basic(`Q${n}`, `A${n}`);
    // 23:00 in Tokyo on 5 October.
    const evening = new Date("2026-10-05T14:00:00Z");
    const first = await flashcardsService.getSession(student, {}, evening);
    expect(first.items.map((i) => i.front)).toEqual(["Q1", "Q2"]);
    for (const item of first.items) await rate(item.cardId, item.ordinal, 4, evening);

    const overview = await flashcardsService.getOverview(student, {}, evening);
    expect(overview).toMatchObject({ new: 0, newHeldBack: 2, reviewedToday: 2 });

    // After midnight in Tokyo, two more new cards are allowed.
    const nextMorning = new Date("2026-10-05T16:00:00Z");
    const second = await flashcardsService.getSession(student, {}, nextMorning);
    expect(second.items.map((i) => i.front)).toEqual(["Q3", "Q4"]);
  });

  it("brings due reviews back, most overdue first, before the end of the day", async () => {
    const t0 = new Date("2026-10-01T09:00:00Z");
    const a = await basic("A?", "A");
    const b = await basic("B?", "B");
    await rate(a.id, 0, 4, t0);
    await rate(b.id, 0, 4, new Date(t0.getTime() + 3_600_000));
    const later = new Date("2026-11-30T09:00:00Z");
    const session = await flashcardsService.getSession(student, { subjectId }, later);
    expect(session.items.map((i) => i.front)).toEqual(["A?", "B?"]);
    expect(session.items.every((i) => i.memory.state === "review")).toBe(true);
  });

  it("covers every subject except archived ones, unless a subject is chosen", async () => {
    await basic("Q", "A");
    await knowledgeService.setSubjectArchived(student, { id: subjectId, archived: true });
    expect((await flashcardsService.getSession(student, {})).items).toHaveLength(0);
    expect((await flashcardsService.getSession(student, { subjectId })).items).toHaveLength(1);
  });

  it("narrows to one topic", async () => {
    await basic("Cells?", "A", { topicIds: [topicId] });
    await basic("Genes?", "B", { topicIds: [otherTopicId] });
    const session = await flashcardsService.getSession(student, { subjectId, topicId });
    expect(session.items.map((i) => i.front)).toEqual(["Cells?"]);
    expect(await code(() => flashcardsService.getSession(student, { topicId: newId() }))).toBe("NOT_FOUND");
  });

  it("counts what is waiting per subject", async () => {
    await basic("Q1", "A1");
    await basic("Q2", "A2");
    const counts = await flashcardsService.getSubjectCounts(student);
    expect(counts.get(subjectId)).toEqual({ due: 0, new: 2 });
  });
});

describe("search", () => {
  it("finds cards by their text, showing cloze answers as plain text", async () => {
    const { id } = await flashcardsService.createCard(student, {
      subjectId,
      type: "cloze",
      front: "The {{c1::mitochondrion}} is where respiration happens",
      back: "",
    });
    const results = await searchService.search(student, { q: "respiration" });
    expect(results.cards).toHaveLength(1);
    expect(results.cards[0]).toMatchObject({
      id,
      subjectId,
      title: "The mitochondrion is where respiration happens",
    });
    expect(results.cards[0]!.snippet.map((p) => p.text).join("")).not.toContain("{{");
  });
});
