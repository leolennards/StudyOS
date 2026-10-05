/**
 * Turning what a student types into Postgres full-text queries (Architecture
 * §31), shared by every module that can be searched. Pure functions: the
 * output only ever contains letters, digits and tsquery operators, so it is
 * safe to pass to `to_tsquery` as a bound parameter.
 */

export const SEARCH_QUERY_MAX = 200;
const MAX_TERMS = 12;

/** Trims, collapses whitespace and caps the length. */
export function normaliseQuery(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX);
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Builds a `to_tsquery('english', …)` expression from free text, so results
 * appear while the student is still typing:
 *
 * - every word matches as a prefix (`entro` finds "entropy");
 * - `"quoted words"` must appear together, in that order;
 * - `-word` excludes notes and pages containing it;
 * - words joined by punctuation (`x-ray`, `H2O`) are treated as a phrase.
 *
 * Returns null when nothing searchable is left (only punctuation, or only
 * exclusions).
 */
export function buildPrefixQuery(input: string): string | null {
  const text = normaliseQuery(input);
  const positive: string[] = [];
  const negative: string[] = [];
  const pattern = /(-?)"([^"]*)"?|(\S+)/g;
  for (const match of text.matchAll(pattern)) {
    const [, minus, quoted, bare] = match;
    if (quoted !== undefined) {
      const parts = words(quoted);
      if (parts.length === 0) continue;
      const phrase = parts.map((p, i) => (i === parts.length - 1 ? `${p}:*` : p)).join(" <-> ");
      (minus ? negative : positive).push(parts.length > 1 ? `(${phrase})` : phrase);
      continue;
    }
    const raw = bare ?? "";
    const negated = raw.startsWith("-") && raw.length > 1;
    const parts = words(negated ? raw.slice(1) : raw);
    if (parts.length === 0) continue;
    if (negated) {
      negative.push(parts.length > 1 ? `(${parts.join(" <-> ")})` : parts[0]!);
    } else {
      const phrase = parts.map((p, i) => (i === parts.length - 1 ? `${p}:*` : p)).join(" <-> ");
      positive.push(parts.length > 1 ? `(${phrase})` : phrase);
    }
  }
  if (positive.length === 0) return null;
  const terms = [...positive.slice(0, MAX_TERMS), ...negative.slice(0, MAX_TERMS).map((n) => `!${n}`)];
  return terms.join(" & ");
}

/** Escapes `%`, `_` and `\` for use inside a LIKE pattern. */
export function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Markers `ts_headline` wraps matches in. Private-use characters, so they
 * cannot collide with real text, and the snippet is returned as plain parts
 * that the UI renders without any HTML.
 */
export const HIGHLIGHT_START = "";
export const HIGHLIGHT_END = "";
export const HEADLINE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxWords=28, MinWords=12, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "`;

export type SnippetPart = { text: string; match: boolean };

/** Splits a `ts_headline` result into plain and highlighted parts. */
export function parseHighlights(headline: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let rest = headline.replace(/\s+/g, " ").trim();
  while (rest.length > 0) {
    const start = rest.indexOf(HIGHLIGHT_START);
    if (start === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false });
    const end = rest.indexOf(HIGHLIGHT_END, start + 1);
    const stop = end === -1 ? rest.length : end;
    const match = rest.slice(start + 1, stop);
    if (match) parts.push({ text: match, match: true });
    rest = rest.slice(stop + 1);
  }
  // Merge neighbours of the same kind, so the UI renders as few spans as possible.
  return parts.reduce<SnippetPart[]>((out, p) => {
    const last = out[out.length - 1];
    if (last && last.match === p.match) last.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

/** A prepared search, as each searchable module receives it from the search module. */
export type SearchInput = {
  /** The `to_tsquery` expression from `buildPrefixQuery`, or null for title-only matching. */
  tsquery: string | null;
  /** The normalised text the student typed, for title matching. */
  text: string;
  subjectId?: string;
  limit: number;
};
