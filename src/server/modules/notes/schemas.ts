import { z } from "zod";
import { NOTE_TITLE_MAX } from "./domain/limits";

/** Input schemas shared by the editor and lists (client) and the actions (server). */
const id = z.uuid("That item isn't valid");

export const createNoteSchema = z.object({
  subjectId: id,
  sectionId: id.nullish(),
  topicIds: z.array(id).max(200).optional(),
});

/** One autosave. The content is checked in depth by the service (see domain/content.ts). */
export const saveNoteSchema = z.object({
  id,
  revision: z.number().int().positive(),
  title: z.string().trim().max(NOTE_TITLE_MAX, `Keep the title under ${NOTE_TITLE_MAX} characters`),
  content: z.unknown(),
});

export const noteIdSchema = z.object({ id });

export const moveNoteSchema = z.object({ id, sectionId: id.nullable() });

export const setNoteTopicsSchema = z.object({
  id,
  topicIds: z.array(id).max(200, "That's too many topics for one note"),
});

export const emptyTrashSchema = z.object({ subjectId: id });

export type SaveNoteInput = z.input<typeof saveNoteSchema>;
