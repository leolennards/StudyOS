import { env } from "@/server/lib/env";
import { LocalStorage } from "./local";
import { signingRegion } from "./region";
import { S3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, SignedUpload } from "./types";
export * from "./keys";

const globalForStorage = globalThis as unknown as { studyosStorage?: StorageAdapter };

/** The configured storage adapter, one per process. */
export function getStorage(): StorageAdapter {
  if (globalForStorage.studyosStorage) return globalForStorage.studyosStorage;
  const e = env();
  const storage =
    e.STORAGE_DRIVER === "s3"
      ? new S3Storage({
          endpoint: e.S3_ENDPOINT!,
          region: signingRegion(e.S3_ENDPOINT!, e.S3_REGION),
          bucket: e.S3_BUCKET!,
          accessKeyId: e.S3_ACCESS_KEY_ID!,
          secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
        })
      : new LocalStorage({ root: e.STORAGE_LOCAL_DIR, secret: e.BETTER_AUTH_SECRET });
  globalForStorage.studyosStorage = storage;
  return storage;
}

/**
 * The local adapter, for the route that serves its signed URLs. Null when
 * storage is S3. Checked by driver rather than instanceof: the instance is
 * shared through globalThis, so it may come from another server bundle's
 * copy of the class.
 */
export function getLocalStorage(): LocalStorage | null {
  const storage = getStorage();
  return storage.driver === "local" ? (storage as LocalStorage) : null;
}

/** Test hook: replace the adapter, or reset it so the next call reads the environment again. */
export function setStorageForTests(storage: StorageAdapter | undefined) {
  globalForStorage.studyosStorage = storage;
}
