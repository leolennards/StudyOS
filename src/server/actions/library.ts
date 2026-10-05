"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/server/lib/action";
import { libraryService } from "@/server/modules/library/service";
import {
  createUploadSchema,
  documentIdSchema,
  documentStatusesSchema,
  setDocumentTopicsSchema,
  updateDocumentSchema,
} from "@/server/modules/library/schemas";

/** Thin transport layer for the library module: validation, auth and error mapping live in `action()`. */

const refresh = (subjectId?: string, documentId?: string) => {
  revalidatePath("/today");
  if (subjectId) revalidatePath(`/subjects/${subjectId}/documents`);
  if (subjectId && documentId) revalidatePath(`/subjects/${subjectId}/documents/${documentId}`);
};

export const createUpload = action(createUploadSchema, (ctx, input) => libraryService.createUpload(ctx, input));

export const confirmUpload = action(documentIdSchema, async (ctx, input) => {
  const result = await libraryService.confirmUpload(ctx, input);
  refresh();
  return result;
});

export const getDocumentStatuses = action(documentStatusesSchema, (ctx, input) =>
  libraryService.getStatuses(ctx, input.ids),
);

export const retryDocument = action(documentIdSchema, (ctx, input) => libraryService.retryProcessing(ctx, input));

export const updateDocument = action(updateDocumentSchema, async (ctx, input) => {
  const result = await libraryService.updateDocument(ctx, input);
  const doc = await libraryService.getDocument(ctx, input.id);
  refresh(doc.subjectId, doc.id);
  return result;
});

export const setDocumentTopics = action(setDocumentTopicsSchema, async (ctx, input) => {
  const result = await libraryService.setTopics(ctx, input);
  const doc = await libraryService.getDocument(ctx, input.id);
  refresh(doc.subjectId, doc.id);
  return result;
});

export const getDocumentDownloadUrl = action(documentIdSchema, (ctx, input) =>
  libraryService.getDownloadUrl(ctx, input.id),
);

export const deleteDocument = action(documentIdSchema, async (ctx, input) => {
  const result = await libraryService.deleteDocument(ctx, input);
  refresh(result.subjectId);
  return result;
});
