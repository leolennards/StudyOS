import { describe, expect, it } from "vitest";
import { buildTree, canAddChild, moveWithin, nextPosition } from "./tree";

describe("canAddChild", () => {
  it("allows a second level but not a third", () => {
    expect(canAddChild(1)).toBe(true);
    expect(canAddChild(2)).toBe(false);
  });
});

describe("nextPosition", () => {
  it("starts at zero when there are no siblings", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("goes after the highest position, even with gaps", () => {
    expect(
      nextPosition([
        { id: "a", position: 0 },
        { id: "b", position: 7 },
      ]),
    ).toBe(8);
  });
});

describe("moveWithin", () => {
  const siblings = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("swaps with the previous sibling when moving up", () => {
    expect(moveWithin(siblings, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("swaps with the next sibling when moving down", () => {
    expect(moveWithin(siblings, "b", "down")).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("does nothing at either edge", () => {
    expect(moveWithin(siblings, "a", "up")).toEqual([]);
    expect(moveWithin(siblings, "c", "down")).toEqual([]);
  });

  it("does nothing for an unknown id", () => {
    expect(moveWithin(siblings, "zz", "up")).toEqual([]);
  });

  it("renumbers from gaps and ties, breaking ties by id", () => {
    const messy = [
      { id: "a", position: 5 },
      { id: "b", position: 5 },
      { id: "c", position: 9 },
    ];
    // Renumbering also repairs `a`, whose position was off the sequence.
    expect(moveWithin(messy, "c", "up")).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });
});

describe("buildTree", () => {
  it("nests sections and attaches each one's topics in order", () => {
    const sections = [
      { id: "m2", parentId: null, position: 1 },
      { id: "m1", parentId: null, position: 0 },
      { id: "c1", parentId: "m1", position: 0 },
    ];
    const topics = [
      { id: "t2", sectionId: "c1", position: 1 },
      { id: "t1", sectionId: "c1", position: 0 },
      { id: "loose", sectionId: null, position: 0 },
    ];

    const { roots, unsectioned } = buildTree(sections, topics);

    expect(roots.map((s) => s.id)).toEqual(["m1", "m2"]);
    expect(roots[0]!.children.map((c) => c.id)).toEqual(["c1"]);
    expect(roots[0]!.children[0]!.topics.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(unsectioned.map((t) => t.id)).toEqual(["loose"]);
  });

  it("treats a section whose parent is missing as a root", () => {
    const { roots } = buildTree([{ id: "orphan", parentId: "gone", position: 0 }], []);
    expect(roots.map((s) => s.id)).toEqual(["orphan"]);
  });

  it("puts topics pointing at a missing section into unsectioned", () => {
    const { unsectioned } = buildTree([], [{ id: "t", sectionId: "gone", position: 0 }]);
    expect(unsectioned.map((t) => t.id)).toEqual(["t"]);
  });
});
