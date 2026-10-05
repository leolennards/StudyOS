import { describe, expect, it } from "vitest";
import { createSectionSchema, createSubjectSchema, createTopicSchema } from "./schemas";

const uuid = "01927f1a-0000-7000-8000-000000000000";

describe("createSubjectSchema", () => {
  it("accepts a name and colour, trimming and emptying optional text", () => {
    const parsed = createSubjectSchema.parse({ name: "  Organic Chemistry  ", code: "", term: "  ", colour: "teal" });
    expect(parsed).toMatchObject({ name: "Organic Chemistry", code: null, term: null, colour: "teal" });
  });

  it("rejects a blank name", () => {
    expect(createSubjectSchema.safeParse({ name: "   ", colour: "teal" }).success).toBe(false);
  });

  it("rejects a colour that is not in the theme", () => {
    expect(createSubjectSchema.safeParse({ name: "Maths", colour: "neon" }).success).toBe(false);
  });

  it("rejects a name over the limit", () => {
    expect(createSubjectSchema.safeParse({ name: "x".repeat(121), colour: "teal" }).success).toBe(false);
  });
});

describe("createSectionSchema", () => {
  it("accepts a label and title", () => {
    expect(createSectionSchema.parse({ subjectId: uuid, label: "Week", title: "Enzymes" })).toMatchObject({
      label: "Week",
      title: "Enzymes",
    });
  });

  it("rejects a subject id that is not a uuid", () => {
    expect(createSectionSchema.safeParse({ subjectId: "1", label: "Week", title: "Enzymes" }).success).toBe(false);
  });
});

describe("createTopicSchema", () => {
  it("allows no section", () => {
    const parsed = createTopicSchema.parse({
      subjectId: uuid,
      sectionId: null,
      name: "Michaelis-Menten",
      description: "",
    });
    expect(parsed).toMatchObject({ sectionId: null, description: null });
  });
});
