import { z } from "zod";
import { DOCUMENT_KINDS } from "./domain/kind";
import { FILENAME_MAX, TITLE_MAX } from "./domain/limits";

/** Input schemas shared by the upload and edit UI (client) and the actions (server). */
const id = z.uuid("That item isn't valid");

export const createUploadSchema = z.object({
  subjectId: id,
  filename: z.string().trim().min(1, "The file has no name").max(FILENAME_MAX, "That filename is too long"),
  size: z.number().int().positive("That file is empty"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "The file's checksum isn't valid"),
});

export const documentIdSchema = z.object({ id });

export const updateDocumentSchema = z.object({
  id,
  title: z.string().trim().min(1, "Give it a title").max(TITLE_MAX, `Keep it under ${TITLE_MAX} characters`).optional(),
  kind: z.enum(DOCUMENT_KINDS).optional(),
});

export const setDocumentTopicsSchema = z.object({
  id,
  topicIds: z.array(id).max(200, "That's too many topics for one document"),
});

export const documentStatusesSchema = z.object({ ids: z.array(id).max(100) });

export type CreateUploadInput = z.input<typeof createUploadSchema>;
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;
