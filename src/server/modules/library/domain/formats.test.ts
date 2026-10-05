import { describe, expect, it } from "vitest";
import { containerMatches, formatFromFilename, sniffContainer } from "./formats";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("formatFromFilename", () => {
  it("accepts the supported formats, case-insensitively", () => {
    expect(formatFromFilename("Lecture 1.PDF")).toEqual({ format: "pdf" });
    expect(formatFromFilename("notes.docx")).toEqual({ format: "docx" });
    expect(formatFromFilename("week2.pptx")).toEqual({ format: "pptx" });
    expect(formatFromFilename("photo.JPG")).toEqual({ format: "jpeg" });
    expect(formatFromFilename("summary.markdown")).toEqual({ format: "md" });
  });

  it("explains why macro-enabled, legacy and HEIC files are refused", () => {
    expect(formatFromFilename("a.docm")).toMatchObject({ error: expect.stringContaining("Macro-enabled") });
    expect(formatFromFilename("a.ppt")).toMatchObject({ error: expect.stringContaining(".pptx") });
    expect(formatFromFilename("IMG_1.heic")).toMatchObject({ error: expect.stringContaining("HEIC") });
  });

  it("refuses unknown and extension-less files", () => {
    expect(formatFromFilename("setup.exe")).toHaveProperty("error");
    expect(formatFromFilename("README")).toHaveProperty("error");
    expect(formatFromFilename(".pdf")).toHaveProperty("error");
  });
});

describe("sniffContainer", () => {
  it("recognises files from their first bytes", () => {
    expect(sniffContainer(text("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffContainer(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe("zip");
    expect(sniffContainer(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffContainer(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffContainer(new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP")]))).toBe("webp");
  });

  it("treats valid UTF-8 without NUL bytes as text", () => {
    expect(sniffContainer(text("Café notes — résumé"))).toBe("text");
    expect(sniffContainer(bytes(0x48, 0x00, 0x49))).toBe("unknown");
    expect(sniffContainer(bytes(0xc3, 0x28, 0x41))).toBe("unknown");
  });

  it("does not reject text cut in the middle of a multi-byte character", () => {
    const long = text("é".repeat(40_000));
    expect(sniffContainer(long.subarray(0, 64 * 1024 + 1))).toBe("text");
  });
});

describe("containerMatches", () => {
  it("only accepts a file whose bytes agree with its name", () => {
    expect(containerMatches("pdf", "pdf")).toBe(true);
    expect(containerMatches("docx", "zip")).toBe(true);
    expect(containerMatches("md", "text")).toBe(true);
    expect(containerMatches("pdf", "text")).toBe(false);
    expect(containerMatches("png", "jpeg")).toBe(false);
  });
});
