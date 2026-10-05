import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RequestContext } from "@/server/lib/context";
import { libraryService } from "@/server/modules/library/service";
import { processDocument } from "@/server/modules/library/pipeline";
import { getStorage, originalKey } from "@/server/platform/storage";

export const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/documents");

export const fixture = (name: string) => readFile(path.join(FIXTURES, name));

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/**
 * Uploads a file the way the browser does (create → PUT to storage →
 * confirm) and, unless told not to, runs the worker's pipeline on it.
 */
export async function uploadFile(
  ctx: RequestContext,
  subjectId: string,
  filename: string,
  data: Buffer,
  opts: { process?: boolean } = {},
) {
  const { id } = await libraryService.createUpload(ctx, {
    subjectId,
    filename,
    size: data.length,
    sha256: sha256(data),
  });
  await getStorage().put(originalKey(ctx.workspaceId, id), data, "application/octet-stream");
  await libraryService.confirmUpload(ctx, { id });
  if (opts.process !== false) await processDocument({ documentId: id, workspaceId: ctx.workspaceId });
  return id;
}

export async function uploadFixture(
  ctx: RequestContext,
  subjectId: string,
  name: string,
  opts?: { process?: boolean },
) {
  return uploadFile(ctx, subjectId, name, await fixture(name), opts);
}
