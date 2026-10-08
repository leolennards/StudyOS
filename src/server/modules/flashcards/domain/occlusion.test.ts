import { describe, expect, it } from "vitest";
import { boxFromPoints, boxNumbers, nextBoxNumber, OCCLUSION_LIMITS, occlusionProblem } from "./occlusion";

describe("boxFromPoints", () => {
  it("makes a box from a drag in any direction, rounded", () => {
    expect(boxFromPoints(1, { x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({ n: 1, x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
    expect(boxFromPoints(2, { x: 0.123456, y: 0.2 }, { x: 0.3, y: 0.3 })).toEqual({
      n: 2,
      x: 0.1235,
      y: 0.2,
      w: 0.1765,
      h: 0.1,
    });
  });

  it("keeps the box inside the picture", () => {
    expect(boxFromPoints(1, { x: -0.2, y: 0.9 }, { x: 0.3, y: 1.4 })).toEqual({ n: 1, x: 0, y: 0.9, w: 0.3, h: 0.1 });
  });

  it("ignores a click or a sliver", () => {
    expect(boxFromPoints(1, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeNull();
    expect(boxFromPoints(1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.505 })).toBeNull();
  });
});

describe("box numbers", () => {
  it("never reuses a number while others remain, so boxes keep their history", () => {
    expect(nextBoxNumber([])).toBe(1);
    expect(nextBoxNumber([{ n: 4, x: 0, y: 0, w: 0.1, h: 0.1 }])).toBe(5);
    // Box 2 was drawn and removed: the next box is 3, not 2 again.
    expect(nextBoxNumber([{ n: 1, x: 0, y: 0, w: 0.1, h: 0.1 }], 2)).toBe(3);
    // Past 99, the lowest free number.
    expect(nextBoxNumber([{ n: 1, x: 0, y: 0, w: 0.1, h: 0.1 }], 99)).toBe(2);
    expect(
      boxNumbers([
        { n: 4, x: 0, y: 0, w: 0.1, h: 0.1 },
        { n: 2, x: 0, y: 0, w: 0.1, h: 0.1 },
      ]),
    ).toEqual([2, 4]);
  });
});

describe("occlusionProblem", () => {
  const box = (n: number, extra: Partial<{ x: number; y: number; w: number; h: number }> = {}) => ({
    n,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.2,
    ...extra,
  });

  it("needs at least one box, and no more than the limit", () => {
    expect(occlusionProblem([])).toMatch(/at least one box/);
    expect(occlusionProblem([box(1)])).toBeNull();
    const many = Array.from({ length: OCCLUSION_LIMITS.boxes + 1 }, (_, i) => box(i + 1));
    expect(occlusionProblem(many)).toMatch(/at most/);
  });

  it("refuses repeated numbers, boxes off the picture and boxes too small to see", () => {
    expect(occlusionProblem([box(1), box(1)])).not.toBeNull();
    expect(occlusionProblem([box(1, { x: 0.9, w: 0.2 })])).not.toBeNull();
    expect(occlusionProblem([box(1, { w: 0.001 })])).not.toBeNull();
    expect(occlusionProblem([box(0)])).not.toBeNull();
  });
});
