"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { knowledgeService } from "@/server/modules/knowledge/service";
import {
  archiveSubjectSchema,
  createSectionSchema,
  createSubjectSchema,
  createTopicSchema,
  deleteByIdSchema,
  deleteSubjectSchema,
  moveSchema,
  updateSectionSchema,
  updateSubjectSchema,
  updateTopicSchema,
} from "@/server/modules/knowledge/schemas";

/** Thin transport layer: validation, auth and error mapping live in `action()`. */

const refreshSubjects = (subjectId?: string) => {
  revalidatePath("/subjects");
  revalidatePath("/today");
  if (subjectId) revalidatePath(`/subjects/${subjectId}`);
};

export const createSubject = action(createSubjectSchema, async (ctx, input) => {
  const result = await knowledgeService.createSubject(ctx, input);
  refreshSubjects();
  return result;
});

export const updateSubject = action(updateSubjectSchema, async (ctx, input) => {
  const result = await knowledgeService.updateSubject(ctx, input);
  refreshSubjects(input.id);
  return result;
});

export const setSubjectArchived = action(archiveSubjectSchema, async (ctx, input) => {
  const result = await knowledgeService.setSubjectArchived(ctx, input);
  refreshSubjects(input.id);
  return result;
});

export const deleteSubject = action(deleteSubjectSchema, async (ctx, input) => {
  const result = await knowledgeService.deleteSubject(ctx, input);
  refreshSubjects();
  return result;
});

export const createSection = action(createSectionSchema, async (ctx, input) => {
  const result = await knowledgeService.createSection(ctx, input);
  refreshSubjects(input.subjectId);
  return result;
});

export const updateSection = action(updateSectionSchema, async (ctx, input) => {
  const result = await knowledgeService.updateSection(ctx, input);
  refreshSubjects();
  return result;
});

export const moveSection = action(moveSchema, async (ctx, input) => {
  const result = await knowledgeService.moveSection(ctx, input);
  refreshSubjects();
  return result;
});

export const getSectionDeleteImpact = action(deleteByIdSchema, (ctx, input) =>
  knowledgeService.sectionDeleteImpact(ctx, input.id),
);

export const deleteSection = action(deleteByIdSchema, async (ctx, input) => {
  const result = await knowledgeService.deleteSection(ctx, input);
  refreshSubjects();
  return result;
});

export const createTopic = action(createTopicSchema, async (ctx, input) => {
  const result = await knowledgeService.createTopic(ctx, input);
  refreshSubjects(input.subjectId);
  return result;
});

export const updateTopic = action(updateTopicSchema, async (ctx, input) => {
  const result = await knowledgeService.updateTopic(ctx, input);
  refreshSubjects();
  return result;
});

export const moveTopic = action(moveSchema, async (ctx, input) => {
  const result = await knowledgeService.moveTopic(ctx, input);
  refreshSubjects();
  return result;
});

export const deleteTopic = action(deleteByIdSchema, async (ctx, input) => {
  const result = await knowledgeService.deleteTopic(ctx, input);
  refreshSubjects();
  return result;
});
