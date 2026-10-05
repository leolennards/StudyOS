import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition } from "./content-disposition";
import { DEFAULT_URL_EXPIRY_SECONDS, type DownloadOptions, type StorageAdapter } from "./types";

/**
 * S3-compatible object storage: Cloudflare R2 in production (ADR-007), or
 * MinIO and AWS S3, which speak the same API. The bucket is private; every
 * read and write goes through a presigned URL that expires in minutes.
 */
export class S3Storage implements StorageAdapter {
  readonly driver = "s3" as const;
  readonly origin: string;
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(opts: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  }) {
    this.#bucket = opts.bucket;
    // Path-style URLs keep the bucket in the path; virtual-hosted ones put it in the hostname.
    const u = new URL(opts.endpoint);
    this.origin = opts.forcePathStyle ? u.origin : `${u.protocol}//${opts.bucket}.${u.host}`;
    this.#client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      // R2 rejects the optional checksum headers newer SDKs add by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async createUploadUrl(key: string, opts: { contentType: string; contentLength: number; expiresInSeconds?: number }) {
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    });
    // Signing the length and type means the browser cannot upload a larger
    // or different file than the one the server approved.
    const url = await getSignedUrl(this.#client, command, {
      expiresIn: opts.expiresInSeconds ?? DEFAULT_URL_EXPIRY_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return { url, method: "PUT" as const, headers: { "Content-Type": opts.contentType } };
  }

  createDownloadUrl(key: string, opts: DownloadOptions) {
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: contentDisposition(opts.disposition, opts.filename),
      ResponseCacheControl: "private, max-age=300",
    });
    return getSignedUrl(this.#client, command, { expiresIn: opts.expiresInSeconds ?? DEFAULT_URL_EXPIRY_SECONDS });
  }

  async head(key: string) {
    try {
      const res = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async get(key: string) {
    const res = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object body");
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.#client.send(
      new PutObjectCommand({ Bucket: this.#bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async list(prefix: string) {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.#client.send(
        new ListObjectsV2Command({ Bucket: this.#bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.#client.send(
        new DeleteObjectsCommand({
          Bucket: this.#bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    return keys.length;
  }
}
