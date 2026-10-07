import { zipSync } from "fflate";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { ankiNoteToDraft, planImport } from "@/server/modules/flashcards/domain/import";
import { collection, type Note, zstdFrame } from "../../../../tests/helpers/anki-package";
import { AnkiReadError, readAnkiPackage } from "./read-anki";

const SQL = await initSqlJs();

const notes: Note[] = [
  { id: 1, fields: ["Capital of France", "<b>Paris</b>"], cards: [{ did: 10, ord: 0 }] },
  {
    id: 2,
    fields: ["chien", "dog"],
    cards: [
      { did: 10, ord: 0 },
      { did: 10, ord: 1 },
    ],
  },
  { id: 3, fields: ["{{c1::Mitosis}} makes two {{c2::identical}} cells", "Extra"], cards: [{ did: 11, ord: 0 }] },
  // In a filtered deck; its home deck is 11.
  { id: 4, fields: ["Area of a circle", "\\(\\pi r^2\\)"], cards: [{ did: 99, ord: 0, odid: 11 }] },
  // A note with no cards is never shown in Anki, so it isn't imported.
  { id: 5, fields: ["Orphan", "note"], cards: [] },
];

describe("readAnkiPackage", () => {
  it("reads an old-format package: notes, the decks they're in, and which directions are reviewed", async () => {
    const apkg = zipSync({
      "collection.anki2": await collection("legacy", { 1: "Default", 10: "French", 11: "Biology::Cells" }, notes),
      media: new TextEncoder().encode("{}"),
    });
    const pack = readAnkiPackage(apkg, SQL);
    expect(pack.decks).toEqual([
      { id: "11", name: "Biology::Cells", notes: 2 },
      { id: "10", name: "French", notes: 2 },
    ]);
    expect(pack.notes).toHaveLength(4);
    expect(pack.notes[1]).toEqual({ fields: ["chien", "dog"], ordinals: [0, 1], deckIds: ["10"] });

    const plan = planImport(pack.notes.map(ankiNoteToDraft), { reverse: false });
    expect(plan.cards).toEqual([
      { type: "basic", front: "Capital of France", back: "Paris" },
      { type: "reverse", front: "chien", back: "dog" },
      { type: "cloze", front: "{{c1::Mitosis}} makes two {{c2::identical}} cells", back: "Extra" },
      { type: "basic", front: "Area of a circle", back: "$\\pi r^2$" },
    ]);
  });

  it("prefers the compressed collection recent Anki versions write", async () => {
    const placeholder = await collection("legacy", { 1: "Default" }, [
      { id: 1, fields: ["Please update to the latest Anki version", ""], cards: [{ did: 1, ord: 0 }] },
    ]);
    const apkg = zipSync({
      "collection.anki2": placeholder,
      "collection.anki21b": zstdFrame(await collection("recent", { 10: "Spanish\u001fVerbs" }, [notes[0]!, notes[1]!])),
    });
    const pack = readAnkiPackage(apkg, SQL);
    expect(pack.decks).toEqual([{ id: "10", name: "Spanish::Verbs", notes: 2 }]);
    expect(pack.notes.map((n) => n.fields[0])).toEqual(["Capital of France", "chien"]);
  });

  it("explains files it can't read", () => {
    expect(() => readAnkiPackage(new TextEncoder().encode("front,back"), SQL)).toThrow(AnkiReadError);
    expect(() => readAnkiPackage(zipSync({ "notes.txt": new Uint8Array(3) }), SQL)).toThrow(/no cards/);
    expect(() => readAnkiPackage(zipSync({ "collection.anki2": new Uint8Array(64) }), SQL)).toThrow(AnkiReadError);
  });
});
