import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isAppError } from "@/server/lib/errors";
import { newId } from "@/server/lib/ids";
import { flashcardsJobs } from "@/server/modules/flashcards/jobs";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { libraryService } from "@/server/modules/library/service";
import { closeDb } from "@/server/platform/db/client";
import { cardImageKey, cardImageUploadKey, getStorage } from "@/server/platform/storage";
import { createTestUser, resetDatabase } from "../helpers/db";

let student: Awaited<ReturnType<typeof createTestUser>>;
let subjectId: string;

async function code(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "OK";
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

/** A plain PNG of the given size. */
const png = (width = 400, height = 300) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();

/** Adds a picture the way the browser does: create, upload to storage, finish. */
async function addPicture(data?: Buffer, ctx = student, subject = subjectId) {
  const body = data ?? (await png());
  const { id, upload } = await flashcardsService.createImageUpload(ctx, {
    subjectId: subject,
    contentType: "image/png",
    size: body.length,
  });
  expect(upload.method).toBe("PUT");
  await getStorage().put(cardImageUploadKey(ctx.workspaceId, id), body, "image/png");
  await flashcardsService.finishImageUpload(ctx, { id });
  return id;
}

const boxes = [
  { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
  { n: 2, x: 0.5, y: 0.6, w: 0.3, h: 0.1 },
];

const occlusionCard = async (imageId: string) =>
  flashcardsService.createCard(student, {
    subjectId,
    type: "image_occlusion",
    front: "Label the heart",
    back: "",
    frontImageId: imageId,
    occlusions: boxes,
  });

beforeEach(async () => {
  await resetDatabase();
  await rm(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true });
  student = await createTestUser();
  ({ id: subjectId } = await knowledgeService.createSubject(student, {
    name: "Biology",
    code: null,
    term: null,
    description: null,
    colour: "emerald",
  }));
});

afterAll(async () => {
  await closeDb();
});

describe("adding a picture", () => {
  it("stores a smaller WebP copy without the original, and counts it against storage", async () => {
    const id = await addPicture(await png(2400, 1200));
    const storage = getStorage();
    expect(await storage.head(cardImageUploadKey(student.workspaceId, id))).toBeNull();
    const stored = await storage.get(cardImageKey(student.workspaceId, id));
    const meta = await sharp(stored).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1600, height: 800 });
    expect((await libraryService.storageUsage(student)).usedBytes).toBe(stored.length);
    expect(await flashcardsService.getImageUrl(student, id)).toContain("/api/storage/local?t=");
  });

  it("refuses a file that isn't a picture, and one that never arrived", async () => {
    const junk = Buffer.from("this is not a picture at all");
    expect(await code(() => addPicture(junk))).toBe("VALIDATION");
    const { id } = await flashcardsService.createImageUpload(student, {
      subjectId,
      contentType: "image/png",
      size: 100,
    });
    expect(await code(() => flashcardsService.finishImageUpload(student, { id }))).toBe("VALIDATION");
    expect(await code(() => flashcardsService.getImageUrl(student, id))).toBe("NOT_FOUND");
  });
});

describe("cards with pictures", () => {
  it("saves a picture on either side and hands it to review", async () => {
    const front = await addPicture();
    const { id } = await flashcardsService.createCard(student, {
      subjectId,
      type: "basic",
      front: "",
      back: "The left ventricle",
      frontImageId: front,
    });
    expect(await flashcardsService.getCard(student, id)).toMatchObject({
      frontImageId: front,
      backImageId: null,
      preview: "Picture",
    });
    const session = await flashcardsService.getSession(student, { subjectId });
    expect(session.items[0]).toMatchObject({ cardId: id, frontImageId: front, back: "The left ventricle" });
  });

  it("refuses a picture that isn't ready or belongs to another subject", async () => {
    const { id: chemistry } = await knowledgeService.createSubject(student, {
      name: "Chemistry",
      code: null,
      term: null,
      description: null,
      colour: "amber",
    });
    const elsewhere = await addPicture(undefined, student, chemistry);
    const { id: pending } = await flashcardsService.createImageUpload(student, {
      subjectId,
      contentType: "image/png",
      size: 100,
    });
    for (const imageId of [elsewhere, pending, newId()]) {
      expect(
        await code(() =>
          flashcardsService.createCard(student, {
            subjectId,
            type: "basic",
            front: "Q",
            back: "",
            backImageId: imageId,
          }),
        ),
      ).toBe("VALIDATION");
    }
  });

  it("asks each box of an image occlusion card, and keeps a box's history when others change", async () => {
    const imageId = await addPicture();
    const { id } = await occlusionCard(imageId);
    let card = await flashcardsService.getCard(student, id);
    expect(card.items.map((i) => i.label)).toEqual(["Box 1", "Box 2"]);
    expect(card.preview).toBe("Label the heart");

    await flashcardsService.reviewCard(student, { reviewId: newId(), cardId: id, ordinal: 2, rating: 3 });
    await flashcardsService.updateCard(student, {
      id,
      type: "image_occlusion",
      front: "Label the heart",
      back: "",
      frontImageId: imageId,
      occlusions: [boxes[1]!, { n: 3, x: 0.6, y: 0.1, w: 0.2, h: 0.2 }],
    });
    card = await flashcardsService.getCard(student, id);
    expect(card.items.map((i) => [i.label, i.reps])).toEqual([
      ["Box 2", 1],
      ["Box 3", 0],
    ]);
  });

  it("needs a picture and a box for image occlusion", async () => {
    const imageId = await addPicture();
    const card = { subjectId, type: "image_occlusion" as const, front: "", back: "" };
    expect(await code(() => flashcardsService.createCard(student, { ...card, occlusions: boxes }))).toBe("VALIDATION");
    expect(
      await code(() => flashcardsService.createCard(student, { ...card, frontImageId: imageId, occlusions: [] })),
    ).toBe("VALIDATION");
  });

  it("leaves cards with pictures out of quizzes", async () => {
    await occlusionCard(await addPicture());
    await flashcardsService.createCard(student, { subjectId, type: "basic", front: "Q", back: "A" });
    const { pool } = await flashcardsService.getQuizItems(student, { subjectId }, 100);
    expect(pool.map((i) => i.front)).toEqual(["Q"]);
  });
});

describe("access", () => {
  it("lets viewers see pictures but not add them, and hides them from other workspaces", async () => {
    const imageId = await addPicture();
    const viewer = { ...student, role: "viewer" as const };
    expect(await code(() => flashcardsService.getImageUrl(viewer, imageId))).toBe("OK");
    expect(
      await code(() => flashcardsService.createImageUpload(viewer, { subjectId, contentType: "image/png", size: 10 })),
    ).toBe("FORBIDDEN");

    const bob = await createTestUser("Bob");
    expect(await code(() => flashcardsService.getImageUrl(bob, imageId))).toBe("NOT_FOUND");
    expect(await code(() => flashcardsService.finishImageUpload(bob, { id: imageId }))).toBe("NOT_FOUND");
  });
});

describe("clean-up", () => {
  it("deletes pictures no card uses a day later, and stored files whose picture is gone", async () => {
    const used = await addPicture();
    await occlusionCard(used);
    const unused = await addPicture();
    const storage = getStorage();
    const stray = newId();
    await storage.put(cardImageKey(student.workspaceId, stray), await png(), "image/webp");

    // Within a day, an unused picture may still be on its way onto a card.
    expect(await flashcardsJobs.cleanUpImages()).toEqual({ unused: 0, orphaned: 1 });
    expect(await storage.head(cardImageKey(student.workspaceId, unused))).not.toBeNull();

    const later = new Date(Date.now() + 2 * 86_400_000);
    expect(await flashcardsJobs.cleanUpImages(later)).toEqual({ unused: 1, orphaned: 0 });
    expect(await storage.head(cardImageKey(student.workspaceId, unused))).toBeNull();
    expect(await code(() => flashcardsService.getImageUrl(student, unused))).toBe("NOT_FOUND");
    expect(await storage.head(cardImageKey(student.workspaceId, used))).not.toBeNull();
  });

  it("removes a deleted card's picture, and a deleted subject's pictures", async () => {
    const imageId = await addPicture();
    const { id } = await occlusionCard(imageId);
    await flashcardsService.deleteCard(student, { id });
    const later = new Date(Date.now() + 2 * 86_400_000);
    expect(await flashcardsJobs.cleanUpImages(later)).toEqual({ unused: 1, orphaned: 0 });

    const second = await addPicture();
    await occlusionCard(second);
    await knowledgeService.deleteSubject(student, { id: subjectId, confirmName: "Biology" });
    expect(await flashcardsJobs.cleanUpImages()).toEqual({ unused: 0, orphaned: 1 });
    expect(await getStorage().head(cardImageKey(student.workspaceId, second))).toBeNull();
  });
});
