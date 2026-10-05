import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeXmlEntities, officeKind, readOfficeZip } from "./zip";

describe("readOfficeZip", () => {
  it("reads the entries asked for and identifies the format", () => {
    const zip = zipSync({ "word/document.xml": strToU8("<w:document/>"), "[Content_Types].xml": strToU8("<Types/>") });
    const { files, names } = readOfficeZip(zip, (n) => n === "word/document.xml");
    expect(Object.keys(files)).toEqual(["word/document.xml"]);
    expect(officeKind(names)).toBe("docx");
  });

  it("refuses files with macros", () => {
    const zip = zipSync({ "ppt/presentation.xml": strToU8("<p/>"), "ppt/vbaProject.bin": strToU8("x") });
    expect(() => readOfficeZip(zip, () => false)).toThrow(/macros/);
  });

  it("refuses parent-relative paths", () => {
    const zip = zipSync({ "../evil.xml": strToU8("x") });
    expect(() => readOfficeZip(zip, () => false)).toThrow(/unsafe paths/);
  });

  it("refuses an archive that decompresses beyond the limit", () => {
    // 301 MB of zeros compresses to a few hundred KB.
    const zip = zipSync({ "word/document.xml": new Uint8Array(301 * 1024 * 1024) }, { level: 9 });
    expect(() => readOfficeZip(zip, () => false)).toThrow(/too large/);
  });

  it("reports a damaged archive", () => {
    expect(() => readOfficeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), () => false)).toThrow(/damaged/);
  });
});

describe("decodeXmlEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeXmlEntities("a &lt;b&gt; &amp; &#233; &#x2014;")).toBe("a <b> & é —");
  });
});
