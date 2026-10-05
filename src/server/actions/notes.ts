"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { notesService } from "@/server/modules/notes/service";
import {
  createNoteSchema,
  emptyTrashSchema,
  moveNoteSchema,
  noteIdSchema,
  saveNoteSchema,
  setNoteTopicsSchema,
} from "@/server/modules/notes/schemas";

/** Thin transport layer for the notes module: validation, auth and error mapping live in `action()`. */

const refresh = (subjectId: string, noteId?: string) => {
  revalidatePath("/today");
  revalidatePath(`/subjects/${subjectId}`, "layout");
  if (noteId) revalidatePath(`/subjects/${subjectId}/notes/${noteId}`);
};

export const createNote = action(createNoteSchema, async (ctx, input) => {
  const result = await notesService.createNote(ctx, input);
  refresh(input.subjectId);
  return result;
});

/**
 * Autosave. It deliberately revalidates nothing: the editor already shows
 * what was saved, and refreshing the page under the cursor would interrupt
 * typing. Lists are fresh the next time they are opened.
 */
export const saveNote = action(saveNoteSchema, (ctx, input) => notesService.saveNote(ctx, input));

export const moveNote = action(moveNoteSchema, async (ctx, input) => {
  const result = await notesService.moveNote(ctx, input);
  refresh(result.subjectId, result.id);
  return result;
});

export const setNoteTopics = action(setNoteTopicsSchema, async (ctx, input) => {
  const result = await notesService.setTopics(ctx, input);
  refresh(result.subjectId, result.id);
  return result;
});

export const trashNote = action(noteIdSchema, async (ctx, input) => {
  const result = await notesService.trashNote(ctx, input);
  refresh(result.subjectId, result.id);
  return result;
});

export const restoreNote = action(noteIdSchema, async (ctx, input) => {
  const result = await notesService.restoreNote(ctx, input);
  refresh(result.subjectId, result.id);
  return result;
});

export const deleteNote = action(noteIdSchema, async (ctx, input) => {
  const result = await notesService.deleteNote(ctx, input);
  refresh(result.subjectId);
  return result;
});

export const emptyTrash = action(emptyTrashSchema, async (ctx, input) => {
  const result = await notesService.emptyTrash(ctx, input);
  refresh(result.subjectId);
  return result;
});
