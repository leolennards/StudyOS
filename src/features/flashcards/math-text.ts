/**
 * Splits card text into plain text and LaTeX maths: `$$…$$` for an equation
 * on its own line, `$…$` inline. An inline formula must not start or end
 * with a space, so prices such as "$5 and $10" stay as text, and `\$` is a
 * literal dollar sign.
 */
export type MathSegment = { kind: "text" | "inline" | "block"; value: string };

export function splitMath(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let text = "";
  const flush = () => {
    if (text) segments.push({ kind: "text", value: text });
    text = "";
  };
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === "\\" && input[i + 1] === "$") {
      text += "$";
      i += 2;
      continue;
    }
    if (ch === "$" && input[i + 1] === "$") {
      const end = input.indexOf("$$", i + 2);
      if (end !== -1 && input.slice(i + 2, end).trim() !== "") {
        flush();
        segments.push({ kind: "block", value: input.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }
    if (ch === "$") {
      const end = findInlineEnd(input, i + 1);
      if (end !== -1) {
        flush();
        segments.push({ kind: "inline", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    text += ch;
    i += 1;
  }
  flush();
  return segments;
}

/** The closing `$` of an inline formula opened just before `start`, or -1. */
function findInlineEnd(input: string, start: number): number {
  const first = input[start];
  if (first === undefined || /\s/.test(first) || first === "$") return -1;
  for (let j = start; j < input.length; j++) {
    const c = input[j]!;
    if (c === "\n") return -1;
    if (c === "\\") {
      j += 1;
      continue;
    }
    if (c === "$") {
      if (/\s/.test(input[j - 1]!)) continue;
      // "$5 and $10": a closing `$` straight before a digit is a price, not maths.
      if (/\d/.test(input[j + 1] ?? "")) continue;
      return j;
    }
  }
  return -1;
}
