import { clozeNumbers } from "./cloze";
import type { CardType } from "./items";
import { CARD_TEXT_MAX } from "./limits";

/**
 * Card import (ADR-018): turns an Anki deck, a Quizlet set or a spreadsheet
 * into StudyOS cards. Files are read in the browser; these pure functions
 * turn what was read into cards, shared by the import screen (to preview)
 * and the tests. The server checks every card again before saving it.
 */

export const IMPORT_SOURCES = ["anki", "quizlet", "text"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  anki: "Anki",
  quizlet: "Quizlet",
  text: "Spreadsheet or text",
};

export const IMPORT_LIMITS = {
  /** The most cards one import adds. */
  cards: 5_000,
  /** Cards sent to the server per request. */
  batch: 200,
  /** Characters of card text sent per request, well inside the 1 MB a request may carry. */
  batchChars: 300_000,
  /** The largest Anki file read, media included. */
  ankiBytes: 300 * 1024 * 1024,
  /** The largest spreadsheet or text file read. */
  textBytes: 5 * 1024 * 1024,
  /** The longest name an import is listed under. */
  name: 200,
} as const;

export type ImportCard = { type: CardType; front: string; back: string };

export type SkipReason = "empty" | "oneSided" | "media" | "badCloze" | "tooLong" | "duplicate";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  empty: "were empty",
  oneSided: "had nothing on one side",
  media: "only had pictures or sound",
  badCloze: "had cloze deletions StudyOS can't read",
  tooLong: `had a side over ${CARD_TEXT_MAX.toLocaleString("en-GB")} characters`,
  duplicate: "appeared more than once",
};

/** One card as read from a file, before the import's options apply. */
export type ImportDraft = { card: ImportCard; hadMedia: boolean } | { skip: SkipReason; hadMedia: boolean };

// ── text from Anki's HTML ───────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  middot: "·",
  bull: "•",
  rarr: "→",
  larr: "←",
  harr: "↔",
  le: "≤",
  ge: "≥",
  ne: "≠",
  micro: "µ",
  shy: "",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Anki's maths delimiters, \(…\), \[…\], [$]…[/$], [$$]…[/$$] and [latex]…[/latex], as StudyOS's `$…$` and `$$…$$`. */
export function ankiMath(text: string): string {
  const inline = (_: string, m: string) => `$${m.trim()}$`;
  const block = (_: string, m: string) => `$$${m.trim()}$$`;
  return text
    .replace(/\\\(([\s\S]+?)\\\)/g, inline)
    .replace(/\\\[([\s\S]+?)\\\]/g, block)
    .replace(/\[\$\$\]([\s\S]+?)\[\/\$\$\]/g, block)
    .replace(/\[\$\]([\s\S]+?)\[\/\$\]/g, inline)
    .replace(/\[latex\]([\s\S]+?)\[\/latex\]/gi, block);
}

/**
 * An Anki field as plain text: line breaks kept, formatting dropped, maths
 * rewritten for StudyOS. Pictures and sound can't be shown on a StudyOS card
 * yet, so they are left out and reported.
 */
export function htmlToText(html: string): { text: string; hadMedia: boolean } {
  let s = html.replace(/\r\n?|\n/g, " ");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const hadMedia = /<(img|audio|video|object|embed)\b|\[sound:/i.test(s);
  s = s
    .replace(/\[sound:[^\]]*\]/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/?(div|p|ul|ol|li|h[1-6]|tr|table|blockquote|pre|section|article)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]*>/g, "");
  s = ankiMath(decodeEntities(s).replace(/ /g, " "));
  return { text: tidy(s), hadMedia };
}

/** Collapses runs of spaces, trims each line and allows at most one blank line in a row. */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Anki notes ──────────────────────────────────────────────────────────────

/**
 * One Anki note as read from the deck: its fields in order (HTML), and the
 * card ordinals Anki made from it (0 and 1 for a reversed note).
 */
export type AnkiNote = { fields: string[]; ordinals: number[] };

const HAS_CLOZE = /\{\{c\d+::/;

/**
 * An Anki note as a StudyOS card. The first field is the front (or the
 * cloze text); the other fields, where filled in, make the back. A note Anki
 * reviews in both directions becomes a reversed card.
 */
export function ankiNoteToDraft(note: AnkiNote): ImportDraft {
  const fields = note.fields.map(htmlToText);
  const hadMedia = fields.some((f) => f.hadMedia);
  const front = fields[0]?.text ?? "";
  const back = fields
    .slice(1)
    .map((f) => f.text)
    .filter((t) => t !== "")
    .join("\n\n");

  if (HAS_CLOZE.test(front)) {
    // Image occlusion notes are cloze notes over a picture.
    if (/image-occlusion:/i.test(note.fields[0] ?? "")) return { skip: "media", hadMedia: true };
    if (clozeNumbers(front).length === 0) return { skip: "badCloze", hadMedia };
    return { card: { type: "cloze", front, back }, hadMedia };
  }
  if (front === "" && back === "") return { skip: hadMedia ? "media" : "empty", hadMedia };
  if (front === "" || back === "") return { skip: hadMedia ? "media" : "oneSided", hadMedia };
  return { card: { type: note.ordinals.includes(1) ? "reverse" : "basic", front, back }, hadMedia };
}

// ── spreadsheets, CSV and Quizlet ───────────────────────────────────────────

export const DELIMITERS = [
  { value: "\t", label: "Tab" },
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon" },
  { value: " - ", label: "Dash ( - )" },
] as const;

/**
 * Splits text into rows of fields, as a spreadsheet saves CSV: a field in
 * double quotes may hold the delimiter, line breaks and `""` for a quote.
 * Each row records whether any of its fields was quoted.
 */
export function parseDelimited(text: string, delimiter: string): { fields: string[]; quoted: boolean }[] {
  const rows: { fields: string[]; quoted: boolean }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const input = text.replace(/^﻿/, "");
  const endRow = () => {
    fields.push(field);
    if (fields.some((f) => f.trim() !== "")) rows.push({ fields, quoted });
    fields = [];
    field = "";
    quoted = false;
  };
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '"' && field.trim() === "") {
      // A quoted field: read to the closing quote.
      let j = i + 1;
      let value = "";
      while (j < input.length) {
        if (input[j] === '"') {
          if (input[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += input[j];
        j += 1;
      }
      if (j < input.length) {
        field = value;
        quoted = true;
        i = j + 1;
        continue;
      }
      // No closing quote: the quote was just text.
    }
    if (input.startsWith(delimiter, i)) {
      fields.push(field);
      field = "";
      i += delimiter.length;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  endRow();
  return rows;
}

/** The delimiter a pasted set or file most likely uses: a tab if there is one, else the most common. */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(0, 20);
  if (lines.some((l) => l.includes("\t"))) return "\t";
  let best = "\t";
  let bestCount = 0;
  for (const candidate of [";", ",", " - "]) {
    const count = lines.filter((l) => l.includes(candidate)).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

const FRONT_HEADINGS = /^(front|question|term|word|prompt|side ?1)$/i;
const BACK_HEADINGS = /^(back|answer|definition|meaning|response|side ?2)$/i;

/** Whether a first row names the columns ("Front, Back", "Term, Definition") rather than being a card. */
export function looksLikeHeader(fields: string[]): boolean {
  return FRONT_HEADINGS.test(fields[0]?.trim() ?? "") && BACK_HEADINGS.test(fields[1]?.trim() ?? "");
}

/**
 * The cards in delimited text: the first field is the front, the second the
 * back. A row with more fields and no quotes is taken to have the delimiter
 * inside its back ("osmosis, water moving, by diffusion"), as Quizlet exports
 * it; in a quoted CSV row the extra columns are left out.
 */
export function textToDrafts(text: string, opts: { delimiter: string; header: boolean }): ImportDraft[] {
  const rows = parseDelimited(text, opts.delimiter);
  const body = opts.header ? rows.slice(1) : rows;
  return body.map(({ fields, quoted }) => {
    const front = tidy(fields[0] ?? "");
    const back = tidy(quoted ? (fields[1] ?? "") : fields.slice(1).join(opts.delimiter));
    if (HAS_CLOZE.test(front)) {
      return clozeNumbers(front).length > 0
        ? { card: { type: "cloze", front, back }, hadMedia: false }
        : { skip: "badCloze", hadMedia: false };
    }
    if (front === "" && back === "") return { skip: "empty", hadMedia: false };
    if (front === "" || back === "") return { skip: "oneSided", hadMedia: false };
    return { card: { type: "basic", front, back }, hadMedia: false };
  });
}

// ── the import as a whole ───────────────────────────────────────────────────

export type ImportPlan = {
  cards: ImportCard[];
  skipped: Partial<Record<SkipReason, number>>;
  /** Cards kept whose pictures or sound were left out. */
  mediaDropped: number;
  /** Cards beyond the import limit, not added. */
  overLimit: number;
};

/**
 * What an import will add: the cards that can be saved, once each, made
 * reversed if asked (basic cards only), up to the import limit; with counts
 * of what was skipped and why.
 */
export function planImport(drafts: ImportDraft[], opts: { reverse: boolean }): ImportPlan {
  const cards: ImportCard[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const seen = new Set<string>();
  let mediaDropped = 0;
  let overLimit = 0;
  const skip = (reason: SkipReason) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  for (const draft of drafts) {
    if ("skip" in draft) {
      skip(draft.skip);
      continue;
    }
    const card = { ...draft.card, type: opts.reverse && draft.card.type === "basic" ? "reverse" : draft.card.type };
    if (card.front.length > CARD_TEXT_MAX || card.back.length > CARD_TEXT_MAX) {
      skip("tooLong");
      continue;
    }
    const key = cardKey(card);
    if (seen.has(key)) {
      skip("duplicate");
      continue;
    }
    seen.add(key);
    if (cards.length >= IMPORT_LIMITS.cards) {
      overLimit += 1;
      continue;
    }
    if (draft.hadMedia) mediaDropped += 1;
    cards.push(card);
  }
  return { cards, skipped, mediaDropped, overLimit };
}

/** Two cards are the same when they ask and answer the same thing, whatever their type. */
export function cardKey(card: { front: string; back: string }): string {
  return `${card.front.trim()}\u0000${card.back.trim()}`;
}

/** The cards split into requests, each within the batch's card and size limits. */
export function importBatches(cards: ImportCard[]): ImportCard[][] {
  const batches: ImportCard[][] = [];
  let batch: ImportCard[] = [];
  let chars = 0;
  for (const card of cards) {
    const size = card.front.length + card.back.length;
    if (batch.length > 0 && (batch.length >= IMPORT_LIMITS.batch || chars + size > IMPORT_LIMITS.batchChars)) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(card);
    chars += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
