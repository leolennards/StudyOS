import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/platform/db/client";
import { isAppError } from "@/server/lib/errors";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { settingsService } from "@/server/modules/settings/service";
import { createTestUser, resetDatabase } from "../helpers/db";

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
