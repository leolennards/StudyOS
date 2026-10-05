/**
 * Copies the PDF viewer's worker and data files from the installed
 * pdfjs-dist into public/pdfjs, so they are served from this origin (the
 * content security policy allows nothing else) and always match the
 * library version. Runs before `dev` and `build`; the output is gitignored.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const out = path.resolve("public/pdfjs");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, "build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}
console.log("PDF viewer assets copied to public/pdfjs");
