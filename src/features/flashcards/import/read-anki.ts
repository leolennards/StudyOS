import { unzipSync } from "fflate";
import { decompress } from "fzstd";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { AnkiNote } from "@/server/modules/flashcards/domain/import";

/**
 * Reads an Anki package (`.apkg`, or a whole collection as `.colpkg`) in the
 * browser. A package is a zip holding the collection as SQLite: recent Anki
 * versions write `collection.anki21b`, compressed with Zstandard, beside an
 * old-format `collection.anki2` that only asks the reader to update Anki;
 * older versions write `collection.anki21` or `collection.anki2`. Pictures
 * and sound in the package are never unpacked.
 */

export type AnkiDeck = { id: string; name: string; notes: number };
export type AnkiPackageNote = AnkiNote & { deckIds: string[] };
export type AnkiPackage = { decks: AnkiDeck[]; notes: AnkiPackageNote[] };

export class AnkiReadError extends Error {}

const COLLECTIONS = ["collection.anki21b", "collection.anki21", "collection.anki2"];

export function readAnkiPackage(bytes: Uint8Array, SQL: SqlJsStatic): AnkiPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => COLLECTIONS.includes(f.name) });
  } catch {
    throw new AnkiReadError("This file isn't an Anki deck. Export the deck from Anki as an .apkg file and try again.");
  }
  const name = COLLECTIONS.find((n) => files[n]);
  if (!name) {
    throw new AnkiReadError("This file has no cards in it that StudyOS can read. Export the deck from Anki again.");
  }
  let data = files[name]!;
  if (name === "collection.anki21b") {
    try {
      data = decompress(data);
    } catch {
      throw new AnkiReadError("This Anki file looks damaged. Export the deck from Anki again.");
    }
  }

  let db: Database;
  try {
    db = new SQL.Database(data);
  } catch {
    throw new AnkiReadError("This Anki file looks damaged. Export the deck from Anki again.");
  }
  try {
    return readCollection(db);
  } catch (error) {
    if (error instanceof AnkiReadError) throw error;
    throw new AnkiReadError("StudyOS couldn't read the cards in this Anki file.");
  } finally {
    db.close();
  }
}

function rows(db: Database, sql: string): SqlValue[][] {
  return db.exec(sql)[0]?.values ?? [];
}

/** Deck names by id: a `decks` table in recent collections, JSON in the `col` row in older ones. */
function deckNames(db: Database): Map<string, string> {
  const names = new Map<string, string>();
  const hasTable = rows(db, "select name from sqlite_master where type = 'table' and name = 'decks'").length > 0;
  if (hasTable) {
    for (const [id, name] of rows(db, "select id, name from decks")) {
      // Recent Anki separates nested deck names with \x1f; show them as Anki does, with "::".
      names.set(String(id), String(name).split("\u001f").join("::"));
    }
    return names;
  }
  const [json] = rows(db, "select decks from col limit 1")[0] ?? [];
  if (typeof json === "string" && json !== "") {
    const decks = JSON.parse(json) as Record<string, { name?: string }>;
    for (const [id, deck] of Object.entries(decks)) names.set(id, deck.name ?? "Deck");
  }
  return names;
}

function readCollection(db: Database): AnkiPackage {
  const names = deckNames(db);
  const byNote = new Map<string, { ordinals: Set<number>; decks: Set<string> }>();
  // A card in a filtered deck remembers its home deck in `odid`.
  for (const [nid, did, ord, odid] of rows(db, "select nid, did, ord, odid from cards")) {
    const entry = byNote.get(String(nid)) ?? { ordinals: new Set<number>(), decks: new Set<string>() };
    entry.ordinals.add(Number(ord));
    entry.decks.add(String(odid && Number(odid) !== 0 ? odid : did));
    byNote.set(String(nid), entry);
  }

  const notes: AnkiPackageNote[] = [];
  const counts = new Map<string, number>();
  for (const [id, flds] of rows(db, "select id, flds from notes order by id")) {
    const cards = byNote.get(String(id));
    if (!cards) continue;
    const deckIds = [...cards.decks];
    for (const d of deckIds) counts.set(d, (counts.get(d) ?? 0) + 1);
    notes.push({
      fields: String(flds ?? "").split("\u001f"),
      ordinals: [...cards.ordinals].sort((a, b) => a - b),
      deckIds,
    });
  }

  const decks = [...counts.entries()]
    .map(([id, n]) => ({ id, name: names.get(id) ?? "Deck", notes: n }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { decks, notes };
}
