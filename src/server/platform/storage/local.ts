import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { contentDisposition } from "./content-disposition";
import { isValidKey } from "./keys";
import { DEFAULT_URL_EXPIRY_SECONDS, type DownloadOptions, type StorageAdapter } from "./types";

/**
 * Files on the local disk, for development and tests. Signed URLs point at
 * this application's own `/api/storage/local` route and carry an HMAC token
 * that names one key, one operation and an expiry, mirroring an S3
 * presigned URL: holding the URL is the permission, and it expires.
 */
export const LOCAL_STORAGE_ROUTE = "/api/storage/local";

type PutToken = { op: "put"; key: string; exp: number; len: number; ct: string };
type GetToken = { op: "get"; key: string; exp: number; ct: string; disp: "inline" | "attachment"; fn: string };
export type StorageToken = PutToken | GetToken;

export class UploadTooLargeError extends Error {
  override name = "UploadTooLargeError";
}

/** By name, since the error may come from another bundle's copy of this module. */
export const isUploadTooLarge = (error: unknown) => error instanceof Error && error.name === "UploadTooLargeError";

export class LocalStorage implements StorageAdapter {
  readonly driver = "local" as const;
  readonly origin = null;
  readonly #root: string;
  readonly #secret: Buffer;

  constructor(opts: { root: string; secret: string }) {
    this.#root = path.resolve(opts.root);
    this.#secret = createHmac("sha256", opts.secret).update("studyos-local-storage").digest();
  }

  #path(key: string) {
    if (!isValidKey(key) && !key.endsWith("/")) throw new Error("Invalid storage key");
    const resolved = path.resolve(this.#root, key);
    if (!resolved.startsWith(this.#root + path.sep)) throw new Error("Invalid storage key");
    return resolved;
  }

  #sign(payload: StorageToken) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const mac = createHmac("sha256", this.#secret).update(body).digest("base64url");
    return `${body}.${mac}`;
  }

  /** Returns the token's payload if its signature is valid, it has not expired and it is for `op`. */
  verifyToken<O extends StorageToken["op"]>(token: string, op: O): Extract<StorageToken, { op: O }> | null {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const expected = createHmac("sha256", this.#secret).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as StorageToken;
      if (payload.op !== op || payload.exp < Date.now() / 1000 || !isValidKey(payload.key)) return null;
      return payload as Extract<StorageToken, { op: O }>;
    } catch {
      return null;
    }
  }

  async createUploadUrl(key: string, opts: { contentType: string; contentLength: number; expiresInSeconds?: number }) {
    this.#path(key);
    const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? DEFAULT_URL_EXPIRY_SECONDS);
    const token = this.#sign({ op: "put", key, exp, len: opts.contentLength, ct: opts.contentType });
    return {
      url: `${LOCAL_STORAGE_ROUTE}?t=${token}`,
      method: "PUT" as const,
      headers: { "Content-Type": opts.contentType },
    };
  }

  async createDownloadUrl(key: string, opts: DownloadOptions) {
    this.#path(key);
    const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? DEFAULT_URL_EXPIRY_SECONDS);
    const token = this.#sign({ op: "get", key, exp, ct: opts.contentType, disp: opts.disposition, fn: opts.filename });
    return `${LOCAL_STORAGE_ROUTE}?t=${token}`;
  }

  /**
   * Streams an upload to disk, refusing more than `maxBytes`. It is written
   * to a temporary file first so a cut-off upload never leaves a partial
   * object behind under the real key.
   */
  async writeStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
    const target = this.#path(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.upload-${process.pid}-${Date.now()}`;
    let written = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        written += chunk.length;
        if (written > maxBytes) done(new UploadTooLargeError("Upload exceeds the declared size"));
        else done(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(body as import("node:stream/web").ReadableStream),
        limit,
        createWriteStream(temp),
      );
      await rename(temp, target);
      return written;
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  readStream(key: string) {
    return Readable.toWeb(createReadStream(this.#path(key))) as ReadableStream<Uint8Array>;
  }

  async head(key: string) {
    try {
      const s = await stat(this.#path(key));
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  }

  async get(key: string) {
    return readFile(this.#path(key));
  }

  async put(key: string, body: Buffer) {
    const target = this.#path(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    const dir = this.#path(prefix);
    await rm(dir, { recursive: true, force: true });
    return keys.length;
  }

  async list(prefix: string) {
    const dir = this.#path(prefix);
    try {
      const entries = await readdir(dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && !e.name.includes(".upload-"))
        .map((e) => path.relative(this.#root, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
    } catch {
      return [];
    }
  }

  /** Headers for serving a stored file to the browser. */
  static responseHeaders(token: GetToken, size: number): Record<string, string> {
    return {
      "Content-Type": token.ct,
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(token.disp, token.fn),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // A stored file can never run script in the application's origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    };
  }
}
