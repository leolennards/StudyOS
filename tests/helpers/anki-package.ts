import { zipSync } from "fflate";
import initSqlJs from "sql.js";

/**
 * Builds Anki packages for tests: just the tables and columns StudyOS reads,
 * in the old format (collection.anki2) or the recent one (collection.anki21b,
 * compressed with Zstandard).
 */

// Loaded once; Playwright compiles test files to CommonJS, so no top-level await.
const sql = initSqlJs();

export type Note = { id: number; fields: string[]; cards: { did: number; ord: number; odid?: number }[] };

/** An Anki collection in the old format (decks as JSON in `col`) or the new one (a `decks` table). */
export async function collection(format: "legacy" | "recent", decks: Record<number, string>, notes: Note[]) {
  const db = new (await sql).Database();
  db.run("create table notes (id integer primary key, mid integer, flds text)");
  db.run("create table cards (id integer primary key, nid integer, did integer, ord integer, odid integer)");
  if (format === "legacy") {
    db.run("create table col (id integer primary key, decks text)");
    const json = Object.fromEntries(Object.entries(decks).map(([id, name]) => [id, { id: Number(id), name }]));
    db.run("insert into col values (1, ?)", [JSON.stringify(json)]);
  } else {
    db.run("create table decks (id integer primary key, name text)");
    for (const [id, name] of Object.entries(decks)) db.run("insert into decks values (?, ?)", [Number(id), name]);
  }
  let cardId = 1;
  for (const n of notes) {
    db.run("insert into notes values (?, 1, ?)", [n.id, n.fields.join("\u001f")]);
    for (const c of n.cards)
      db.run("insert into cards values (?, ?, ?, ?, ?)", [cardId++, n.id, c.did, c.ord, c.odid ?? 0]);
  }
  const bytes = db.export();
  db.close();
  return bytes;
}

/** Wraps bytes in a Zstandard frame of uncompressed blocks, as a stand-in for Anki's compression. */
export function zstdFrame(data: Uint8Array) {
  const parts: number[] = [0x28, 0xb5, 0x2f, 0xfd, 0xe0];
  // The 8-byte content size, little-endian; test collections are far below 4 GB.
  for (let i = 0; i < 8; i++) parts.push(i < 4 ? (data.length >>> (8 * i)) & 0xff : 0);
  const BLOCK = 128 * 1024;
  for (let at = 0; at < data.length || at === 0; at += BLOCK) {
    const chunk = data.subarray(at, at + BLOCK);
    const last = at + BLOCK >= data.length ? 1 : 0;
    const header = last | (chunk.length << 3);
    parts.push(header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff, ...chunk);
    if (data.length === 0) break;
  }
  return new Uint8Array(parts);
}

/** A package as Anki exports it: a zip with the collection and a media index. */
export async function ankiPackage(
  decks: Record<number, string>,
  notes: Note[],
  format: "legacy" | "recent" = "recent",
) {
  const files: Record<string, Uint8Array> =
    format === "legacy"
      ? { "collection.anki2": await collection("legacy", decks, notes) }
      : {
          "collection.anki2": await collection("legacy", { 1: "Default" }, [
            { id: 1, fields: ["Please update to the latest Anki version", ""], cards: [{ did: 1, ord: 0 }] },
          ]),
          "collection.anki21b": zstdFrame(await collection("recent", decks, notes)),
        };
  return zipSync({ ...files, media: new TextEncoder().encode("{}") });
}
