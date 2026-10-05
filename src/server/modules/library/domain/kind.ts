/**
 * What a document is to the student. Past papers and mark schemes matter
 * later (Architecture §22), so the kind is recorded from the start; it is
 * guessed from the filename and the student can change it.
 */
export const DOCUMENT_KINDS = ["lecture", "notes", "textbook", "past_paper", "mark_scheme", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const KIND_LABELS: Record<DocumentKind, string> = {
  lecture: "Lecture",
  notes: "Notes",
  textbook: "Textbook",
  past_paper: "Past paper",
  mark_scheme: "Mark scheme",
  other: "Other",
};

const RULES: [RegExp, DocumentKind][] = [
  [/mark[\s_-]*scheme|marking[\s_-]*(guide|scheme)|answers?|solutions?|\bms\b/i, "mark_scheme"],
  [/past[\s_-]*paper|exam|\bpaper[\s_-]*\d|\bqp\b|midterm/i, "past_paper"],
  [/lecture|slides?|\blec\b|\bweek[\s_-]*\d+|\bl\d+\b/i, "lecture"],
  [/textbook|chapter|\bch\s*\d+|\bbook\b/i, "textbook"],
  [/notes?|summary|revision|cheat[\s_-]*sheet|handout/i, "notes"],
];

export function guessKind(filename: string): DocumentKind {
  const name = filename.replace(/\.[^.]+$/, "");
  for (const [re, kind] of RULES) if (re.test(name)) return kind;
  return "other";
}

/** A readable default title from a filename: no extension, separators as spaces. */
export function titleFromFilename(filename: string) {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Untitled document").slice(0, 200);
}
