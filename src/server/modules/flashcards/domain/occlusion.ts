/**
 * Image occlusion (ADR-021): boxes hidden on a picture, each asked as its own
 * review item. Positions are fractions of the picture's width and height, so
 * a box stays in place however large the picture is shown.
 */
export type OcclusionBox = { n: number; x: number; y: number; w: number; h: number };

export const OCCLUSION_LIMITS = {
  /** The most boxes on one card. Box numbers are review ordinals, which stop at 99. */
  boxes: 50,
  /** The highest box number. */
  maxNumber: 99,
  /** Boxes narrower or shorter than this fraction of the picture are too small to see or tap. */
  minSize: 0.01,
} as const;

/** Positions are kept to four decimal places: finer than any screen, and short in the database. */
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * A box as drawn between two points, clamped to the picture and rounded.
 * Null when it is too small to keep (a click rather than a drag).
 */
export function boxFromPoints(
  n: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): OcclusionBox | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x1 = clamp(Math.min(a.x, b.x));
  const y1 = clamp(Math.min(a.y, b.y));
  const x2 = clamp(Math.max(a.x, b.x));
  const y2 = clamp(Math.max(a.y, b.y));
  if (x2 - x1 < OCCLUSION_LIMITS.minSize || y2 - y1 < OCCLUSION_LIMITS.minSize) return null;
  return { n, x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
}

/**
 * The number for the next box: one more than the highest so far, or than the
 * highest ever drawn while the card is open (`highestUsed`). Numbers are not
 * reused while the card is open, so removing a box and drawing another never
 * hands the new one the old box's review history. Past the last number, the
 * lowest free one is used.
 */
export function nextBoxNumber(boxes: OcclusionBox[], highestUsed = 0): number {
  const next = boxes.reduce((max, b) => Math.max(max, b.n), highestUsed) + 1;
  if (next <= OCCLUSION_LIMITS.maxNumber) return next;
  const taken = new Set(boxes.map((b) => b.n));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/** Why a set of boxes can't be saved, or null when it can. */
export function occlusionProblem(boxes: OcclusionBox[]): string | null {
  if (boxes.length === 0) return "Draw at least one box over the part of the picture to hide.";
  if (boxes.length > OCCLUSION_LIMITS.boxes) return `Use at most ${OCCLUSION_LIMITS.boxes} boxes on one card.`;
  const numbers = new Set<number>();
  for (const b of boxes) {
    if (!Number.isInteger(b.n) || b.n < 1 || b.n > 99 || numbers.has(b.n)) return "Those boxes aren't valid.";
    numbers.add(b.n);
    const inside = b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001;
    if (!inside || b.w < OCCLUSION_LIMITS.minSize || b.h < OCCLUSION_LIMITS.minSize) {
      return "Those boxes aren't valid.";
    }
  }
  return null;
}

/** Box numbers in order: the card's review ordinals. */
export const boxNumbers = (boxes: OcclusionBox[]) => boxes.map((b) => b.n).sort((a, b) => a - b);
