/**
 * The only interface the rest of the application uses to reach file storage
 * (Architecture §4 rule 4, §8). Two implementations: S3-compatible object
 * storage (Cloudflare R2 in production) and the local disk for development
 * and tests. Both hand out short-lived signed URLs, so the browser talks to
 * storage directly and the client code is the same for either.
 */
export type SignedUpload = {
  url: string;
  method: "PUT";
  /** Headers the browser must send unchanged; they are part of the signature. */
  headers: Record<string, string>;
};

export type DownloadOptions = {
  contentType: string;
  /** `inline` for the viewer, `attachment` for "Download". */
  disposition: "inline" | "attachment";
  filename: string;
  expiresInSeconds?: number;
};

export interface StorageAdapter {
  readonly driver: "local" | "s3";
  /** The origin signed URLs point at, for the content security policy. */
  readonly origin: string | null;
  createUploadUrl(
    key: string,
    opts: { contentType: string; contentLength: number; expiresInSeconds?: number },
  ): Promise<SignedUpload>;
  createDownloadUrl(key: string, opts: DownloadOptions): Promise<string>;
  /** Size of a stored object, or null when it does not exist. */
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Deletes every object under a prefix and returns how many were removed. */
  deletePrefix(prefix: string): Promise<number>;
  /** Lists object keys under a prefix. */
  list(prefix: string): Promise<string[]>;
}

export const DEFAULT_URL_EXPIRY_SECONDS = 5 * 60;
