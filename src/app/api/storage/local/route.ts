import type { NextRequest } from "next/server";
import { getLocalStorage } from "@/server/platform/storage";
import { isUploadTooLarge, LocalStorage } from "@/server/platform/storage/local";
import { logger } from "@/server/platform/observability/logger";

export const dynamic = "force-dynamic";

/**
 * Serves the local storage driver's signed URLs (development and tests).
 * With S3 storage this route does not exist: the browser talks to the
 * bucket directly. The token in the URL is the permission, exactly as a
 * presigned S3 URL would be.
 */
const json = (status: number, error: string) => Response.json({ error }, { status });

export async function PUT(request: NextRequest) {
  const storage = getLocalStorage();
  if (!storage) return json(404, "Not found");
  const token = storage.verifyToken(request.nextUrl.searchParams.get("t") ?? "", "put");
  if (!token) return json(403, "This upload link has expired. Try again.");
  if (request.headers.get("content-type") !== token.ct) return json(400, "Unexpected file type.");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > token.len) return json(413, "The file is larger than expected.");
  if (!request.body) return json(400, "The upload was empty.");
  try {
    const written = await storage.writeStream(token.key, request.body, token.len);
    if (written !== token.len) return json(400, "The upload was incomplete.");
    return new Response(null, { status: 200 });
  } catch (error) {
    if (isUploadTooLarge(error)) return json(413, "The file is larger than expected.");
    logger.error({ err: error }, "local upload failed");
    return json(500, "The upload failed. Try again.");
  }
}

export async function GET(request: NextRequest) {
  const storage = getLocalStorage();
  if (!storage) return json(404, "Not found");
  const token = storage.verifyToken(request.nextUrl.searchParams.get("t") ?? "", "get");
  if (!token) return json(403, "This link has expired. Reload the page.");
  const head = await storage.head(token.key);
  if (!head) return json(404, "Not found");
  return new Response(storage.readStream(token.key), { headers: LocalStorage.responseHeaders(token, head.size) });
}
