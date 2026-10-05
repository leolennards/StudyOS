import { describe, expect, it } from "vitest";
import { S3Storage } from "./s3";

const storage = new S3Storage({
  endpoint: "https://account.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "studyos",
  accessKeyId: "test",
  secretAccessKey: "test",
  forcePathStyle: false,
});

describe("S3Storage", () => {
  it("signs uploads to the exact type and length the server approved", async () => {
    const upload = await storage.createUploadUrl("ws/a/docs/b/original", {
      contentType: "application/pdf",
      contentLength: 1234,
    });
    const url = new URL(upload.url);
    expect(url.origin).toBe("https://studyos.account.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(300);
    expect(upload.headers).toEqual({ "Content-Type": "application/pdf" });
  });

  it("signs downloads with the filename and type set by the server", async () => {
    const url = new URL(
      await storage.createDownloadUrl("ws/a/docs/b/original", {
        contentType: "application/pdf",
        disposition: "attachment",
        filename: "Week 1.pdf",
      }),
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toContain('attachment; filename="Week 1.pdf"');
    expect(storage.origin).toBe("https://studyos.account.r2.cloudflarestorage.com");
  });
});
