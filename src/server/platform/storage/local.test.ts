import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentDisposition } from "./content-disposition";
import { documentPrefix, isValidKey, originalKey, parseDocumentKey } from "./keys";
import { LocalStorage } from "./local";

const WS = "01990000-0000-7000-8000-000000000001";
const DOC = "01990000-0000-7000-8000-000000000002";
let root: string;
let storage: LocalStorage;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studyos-storage-test-"));
  storage = new LocalStorage({ root, secret: "a-secret-that-is-long-enough-for-tests" });
});
afterAll(() => rm(root, { recursive: true, force: true }));

const tokenOf = (url: string) => new URL(url, "http://x").searchParams.get("t")!;

describe("keys", () => {
  it("builds keys only from ids, inside the workspace", () => {
    expect(originalKey(WS, DOC)).toBe(`ws/${WS}/docs/${DOC}/original`);
    expect(isValidKey(originalKey(WS, DOC))).toBe(true);
    expect(isValidKey(`ws/${WS}/docs/${DOC}/../../other`)).toBe(false);
    expect(isValidKey(`ws/${WS}/docs/${DOC}/derived/preview.pdf`)).toBe(true);
    expect(parseDocumentKey(`${documentPrefix(WS, DOC)}original`)).toEqual({ workspaceId: WS, documentId: DOC });
  });
});

describe("signed URLs", () => {
  it("verifies its own tokens for the operation they were made for", async () => {
    const upload = await storage.createUploadUrl(originalKey(WS, DOC), {
      contentType: "application/pdf",
      contentLength: 5,
    });
    const token = storage.verifyToken(tokenOf(upload.url), "put");
    expect(token).toMatchObject({ key: originalKey(WS, DOC), len: 5, ct: "application/pdf" });
    expect(storage.verifyToken(tokenOf(upload.url), "get")).toBeNull();
  });

  it("rejects a tampered, foreign or expired token", async () => {
    const url = await storage.createDownloadUrl(originalKey(WS, DOC), {
      contentType: "application/pdf",
      disposition: "inline",
      filename: "a.pdf",
    });
    const [body, mac] = tokenOf(url).split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), key: "x" }));
    expect(storage.verifyToken(`${forged.toString("base64url")}.${mac}`, "get")).toBeNull();

    const other = new LocalStorage({ root, secret: "a-different-secret-that-is-long-enough" });
    expect(other.verifyToken(tokenOf(url), "get")).toBeNull();

    const expired = await storage.createDownloadUrl(originalKey(WS, DOC), {
      contentType: "application/pdf",
      disposition: "inline",
      filename: "a.pdf",
      expiresInSeconds: -1,
    });
    expect(storage.verifyToken(tokenOf(expired), "get")).toBeNull();
  });
});

describe("files", () => {
  it("streams an upload to disk and refuses more than the declared size", async () => {
    const key = originalKey(WS, DOC);
    const body = new Blob(["hello"]).stream();
    expect(await storage.writeStream(key, body, 5)).toBe(5);
    expect((await storage.get(key)).toString()).toBe("hello");
    await expect(storage.writeStream(key, new Blob(["too long"]).stream(), 5)).rejects.toThrow();
    expect((await storage.get(key)).toString()).toBe("hello");
  });

  it("lists and deletes by prefix", async () => {
    await storage.put(`${documentPrefix(WS, DOC)}derived/preview.pdf`, Buffer.from("x"));
    expect((await storage.list(documentPrefix(WS, DOC))).sort()).toEqual([
      `${documentPrefix(WS, DOC)}derived/preview.pdf`,
      `${documentPrefix(WS, DOC)}original`,
    ]);
    expect(await storage.deletePrefix(documentPrefix(WS, DOC))).toBe(2);
    expect(await storage.head(originalKey(WS, DOC))).toBeNull();
  });

  it("refuses paths outside the storage root", async () => {
    await expect(storage.get("ws/../../etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});

describe("contentDisposition", () => {
  it("cannot be used to inject header content", () => {
    expect(contentDisposition("attachment", 'Lecture "1"\r\n.pdf')).toBe(
      `attachment; filename="Lecture 1.pdf"; filename*=UTF-8''Lecture%201.pdf`,
    );
    expect(contentDisposition("inline", "Résumé.pdf")).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9.pdf");
  });
});
