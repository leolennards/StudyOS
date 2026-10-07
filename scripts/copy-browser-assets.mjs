/**
 * Copies the files two browser libraries load at run time into public/, so
 * they are served from this origin (the content security policy allows
 * nothing else) and always match the installed version: the PDF viewer's
 * worker and data files from pdfjs-dist into public/pdfjs, and SQLite's
 * WebAssembly from sql.js into public/sqljs, which the card import uses to
 * read Anki decks. Runs before `dev` and `build`; the output is gitignored.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const pdfjs = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjsOut = path.resolve("public/pdfjs");
await rm(pdfjsOut, { recursive: true, force: true });
await mkdir(pdfjsOut, { recursive: true });
await cp(path.join(pdfjs, "build/pdf.worker.min.mjs"), path.join(pdfjsOut, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(path.join(pdfjs, dir), path.join(pdfjsOut, dir), { recursive: true });
}

// sql.js exports only its builds, not package.json.
const sqljs = path.dirname(require.resolve("sql.js/dist/sql-wasm-browser.wasm"));
const sqljsOut = path.resolve("public/sqljs");
await rm(sqljsOut, { recursive: true, force: true });
await mkdir(sqljsOut, { recursive: true });
await cp(path.join(sqljs, "sql-wasm-browser.wasm"), path.join(sqljsOut, "sql-wasm-browser.wasm"));

console.log("Browser assets copied to public/pdfjs and public/sqljs");
