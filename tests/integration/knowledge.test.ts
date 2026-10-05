import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/platform/db/client";
import { isAppError } from "@/server/lib/errors";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { createTestUser, resetDatabase } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof createTestUser>>;

beforeEach(async () => {
  await resetDatabase();
  ctx = await createTestUser();
});

afterAll(async () => {
  await closeDb();
});

const subject = (name = "Organic Chemistry") =>
  knowledgeService.createSubject(ctx, { name, code: "CHEM201", term: "Semester 2", description: null, colour: "teal" });

async function errorCode(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (error) {
    return isAppError(error) ? error.code : "UNEXPECTED";
  }
}

describe("subjects", () => {
  it("creates a subject and lists it with zero counts", async () => {
    const { id } = await subject();
    const list = await knowledgeService.listSubjects(ctx);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "Organic Chemistry", code: "CHEM201", sectionCount: 0, topicCount: 0 });
  });

  it("orders subjects by name, ignoring case", async () => {
    await subject("zoology");
    await subject("Anatomy");
    const list = await knowledgeService.listSubjects(ctx);
    expect(list.map((s) => s.name)).toEqual(["Anatomy", "zoology"]);
  });

  it("archives a subject, which removes it from the active list", async () => {
    const { id } = await subject();
    await knowledgeService.setSubjectArchived(ctx, { id, archived: true });
    expect(await knowledgeService.listSubjects(ctx)).toHaveLength(0);
    expect(await knowledgeService.listSubjects(ctx, { archived: true })).toHaveLength(1);
    await knowledgeService.setSubjectArchived(ctx, { id, archived: false });
    expect(await knowledgeService.listSubjects(ctx)).toHaveLength(1);
  });

  it("requires the exact name to delete, ignoring case and spacing", async () => {
    const { id } = await subject();
    expect(await errorCode(() => knowledgeService.deleteSubject(ctx, { id, confirmName: "wrong" }))).toBe("VALIDATION");
    await knowledgeService.deleteSubject(ctx, { id, confirmName: "  organic chemistry " });
    expect(await knowledgeService.listSubjects(ctx)).toHaveLength(0);
  });

  it("reports NOT_FOUND for a subject that does not exist", async () => {
    expect(await errorCode(() => knowledgeService.getSubject(ctx, "01927f1a-0000-7000-8000-000000000000"))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("sections", () => {
  it("nests two levels and refuses a third", async () => {
    const { id: subjectId } = await subject();
    const moduleSection = await knowledgeService.createSection(ctx, {
      subjectId,
      parentId: null,
      label: "Module",
      title: "Kinetics",
    });
    const chapter = await knowledgeService.createSection(ctx, {
      subjectId,
      parentId: moduleSection.id,
      label: "Chapter",
      title: "Rate laws",
    });
    expect(
      await errorCode(() =>
        knowledgeService.createSection(ctx, { subjectId, parentId: chapter.id, label: "Part", title: "Too deep" }),
      ),
    ).toBe("VALIDATION");
  });

  it("numbers new siblings in order and moves them", async () => {
    const { id: subjectId } = await subject();
    const a = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "One" });
    const b = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "Two" });
    const c = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "Three" });

    const titles = async () => (await knowledgeService.getSubjectTree(ctx, subjectId)).sections.map((s) => s.title);
    expect(await titles()).toEqual(["One", "Two", "Three"]);

    await knowledgeService.moveSection(ctx, { id: c.id, direction: "up" });
    expect(await titles()).toEqual(["One", "Three", "Two"]);

    await knowledgeService.moveSection(ctx, { id: a.id, direction: "down" });
    expect(await titles()).toEqual(["Three", "One", "Two"]);

    expect(await knowledgeService.moveSection(ctx, { id: b.id, direction: "down" })).toMatchObject({ moved: false });
  });

  it("deletes sub-sections with their parent but keeps the topics", async () => {
    const { id: subjectId } = await subject();
    const moduleSection = await knowledgeService.createSection(ctx, { subjectId, label: "Module", title: "Kinetics" });
    const chapter = await knowledgeService.createSection(ctx, {
      subjectId,
      parentId: moduleSection.id,
      label: "Chapter",
      title: "Rate laws",
    });
    await knowledgeService.createTopic(ctx, { subjectId, sectionId: chapter.id, name: "Half-life", description: null });

    expect(await knowledgeService.sectionDeleteImpact(ctx, moduleSection.id)).toEqual({ childSections: 1, topics: 1 });

    await knowledgeService.deleteSection(ctx, { id: moduleSection.id });
    const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
    expect(tree.sections).toHaveLength(0);
    expect(tree.unsectioned.map((t) => t.name)).toEqual(["Half-life"]);
  });

  it("refuses a parent section from another subject", async () => {
    const one = await subject("Chemistry");
    const two = await subject("Physics");
    const section = await knowledgeService.createSection(ctx, { subjectId: two.id, label: "Week", title: "Optics" });
    expect(
      await errorCode(() =>
        knowledgeService.createSection(ctx, { subjectId: one.id, parentId: section.id, label: "Week", title: "Wrong" }),
      ),
    ).toBe("VALIDATION");
  });
});

describe("topics", () => {
  it("moves a topic between sections and puts it last", async () => {
    const { id: subjectId } = await subject();
    const week1 = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "One" });
    const week2 = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "Two" });
    await knowledgeService.createTopic(ctx, { subjectId, sectionId: week2.id, name: "Existing", description: null });
    const moving = await knowledgeService.createTopic(ctx, {
      subjectId,
      sectionId: week1.id,
      name: "Moving",
      description: null,
    });

    await knowledgeService.updateTopic(ctx, { id: moving.id, sectionId: week2.id });

    const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
    expect(tree.sections[0]!.topics).toHaveLength(0);
    expect(tree.sections[1]!.topics.map((t) => t.name)).toEqual(["Existing", "Moving"]);
  });

  it("detaches a topic from its section without deleting it", async () => {
    const { id: subjectId } = await subject();
    const week = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "One" });
    const topic = await knowledgeService.createTopic(ctx, {
      subjectId,
      sectionId: week.id,
      name: "Loose",
      description: null,
    });
    await knowledgeService.updateTopic(ctx, { id: topic.id, sectionId: null });
    const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
    expect(tree.unsectioned.map((t) => t.name)).toEqual(["Loose"]);
  });

  it("counts sections and topics on the subject list", async () => {
    const { id: subjectId } = await subject();
    const week = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "One" });
    await knowledgeService.createTopic(ctx, { subjectId, sectionId: week.id, name: "A", description: null });
    await knowledgeService.createTopic(ctx, { subjectId, sectionId: null, name: "B", description: null });
    const [listed] = await knowledgeService.listSubjects(ctx);
    expect(listed).toMatchObject({ sectionCount: 1, topicCount: 2 });
  });

  it("deletes the subject's sections and topics with it", async () => {
    const { id: subjectId } = await subject();
    const week = await knowledgeService.createSection(ctx, { subjectId, label: "Week", title: "One" });
    await knowledgeService.createTopic(ctx, { subjectId, sectionId: week.id, name: "A", description: null });
    await knowledgeService.deleteSubject(ctx, { id: subjectId, confirmName: "Organic Chemistry" });
    expect(await errorCode(() => knowledgeService.getSubjectTree(ctx, subjectId))).toBe("NOT_FOUND");
  });
});

describe("viewer role", () => {
  it("cannot write", async () => {
    const viewer = { ...ctx, role: "viewer" as const };
    expect(
      await errorCode(() =>
        knowledgeService.createSubject(viewer, {
          name: "Nope",
          code: null,
          term: null,
          description: null,
          colour: "teal",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
