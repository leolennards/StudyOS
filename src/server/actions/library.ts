"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { action } from "@/server/lib/action";
import { libraryService } from "@/server/modules/library/service";
import {
  createUploadSchema,
  documentIdSchema,
  documentStatusesSchema,
  setDocumentTopicsSchema,
  updateDocumentSchema,
} from "@/server/modules/library/schemas";
import { wakeWorker } from "@/server/platform/jobs/wake";

/** Thin transport layer for the library module: validation, auth and error mapping live in `action()`. */

const refresh = (subjectId?: string, documentId?: string) => {
  revalidatePath("/today");
  if (subjectId) revalidatePath(`/subjects/${subjectId}/documents`);
  if (subjectId && documentId) revalidatePath(`/subjects/${subjectId}/documents/${documentId}`);
};

export const createUpload = action(createUploadSchema, (ctx, input) => libraryService.createUpload(ctx, input));

export const confirmUpload = action(documentIdSchema, async (ctx, input) => {
  const result = await libraryService.confirmUpload(ctx, input);
  after(wakeWorker);
  refresh();
  return result;
});

export const getDocumentStatuses = action(documentStatusesSchema, async (ctx, input) => {
  const statuses = await libraryService.getStatuses(ctx, input.ids);
  // A document still waiting means the worker should be running; wake it in case its host put it to sleep.
  if (statuses.some((s) => s.status === "uploaded" || s.status === "processing")) after(wakeWorker);
  return statuses;
});

export const retryDocument = action(documentIdSchema, async (ctx, input) => {
  const result = await libraryService.retryProcessing(ctx, input);
  after(wakeWorker);
  return result;
});

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
