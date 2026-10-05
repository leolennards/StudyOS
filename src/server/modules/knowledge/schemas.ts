import { z } from "zod";
import { LIMITS, SUBJECT_COLOURS } from "./domain/constants";

/** Input schemas shared by the forms (client) and the actions (server). */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const requiredText = (max: number, what: string) =>
  z.string().trim().min(1, `Give it a ${what}`).max(max, `Keep it under ${max} characters`);

const id = z.uuid("That item isn't valid");
const direction = z.enum(["up", "down"]);

export const createSubjectSchema = z.object({
  name: requiredText(LIMITS.subjectName, "name"),
  code: optionalText(LIMITS.subjectCode),
  term: optionalText(LIMITS.subjectTerm),
  description: optionalText(LIMITS.subjectDescription),
  colour: z.enum(SUBJECT_COLOURS),
});
export const updateSubjectSchema = createSubjectSchema.partial().extend({ id });
export const archiveSubjectSchema = z.object({ id, archived: z.boolean() });
export const deleteSubjectSchema = z.object({ id, confirmName: z.string() });

export const createSectionSchema = z.object({
  subjectId: id,
  parentId: id.nullable().optional(),
  label: requiredText(LIMITS.sectionLabel, "label"),
  title: requiredText(LIMITS.sectionTitle, "title"),
});
export const updateSectionSchema = z.object({
  id,
  label: requiredText(LIMITS.sectionLabel, "label").optional(),
  title: requiredText(LIMITS.sectionTitle, "title").optional(),
});
export const moveSchema = z.object({ id, direction });
export const deleteByIdSchema = z.object({ id });

export const createTopicSchema = z.object({
  subjectId: id,
  sectionId: id.nullable().optional(),
  name: requiredText(LIMITS.topicName, "name"),
  description: optionalText(LIMITS.topicDescription),
});
export const updateTopicSchema = z.object({
  id,
  name: requiredText(LIMITS.topicName, "name").optional(),
  description: optionalText(LIMITS.topicDescription),
  sectionId: id.nullable().optional(),
});

export type CreateSubjectInput = z.input<typeof createSubjectSchema>;
export type CreateSectionInput = z.input<typeof createSectionSchema>;
export type CreateTopicInput = z.input<typeof createTopicSchema>;
