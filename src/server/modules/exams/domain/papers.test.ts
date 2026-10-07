import { describe, expect, it } from "vitest";
import { analysePapers, focusTopics, nextQuestionNumber, paperTotal, percent, trend } from "./papers";

describe("paperTotal", () => {
  it("adds up the questions once they're entered, otherwise uses the total given", () => {
    expect(paperTotal([{ marks: 5 }, { marks: 7 }], 80)).toBe(12);
    expect(paperTotal([], 80)).toBe(80);
    expect(paperTotal([], null)).toBeNull();
  });
});

describe("nextQuestionNumber", () => {
  it.each([
    [undefined, "1"],
    ["3", "4"],
    ["9", "10"],
    ["Q7", "Q8"],
    ["2b", "2c"],
    ["1a(ii)", "1a(iii)"],
    ["4(iv)", "4(v)"],
    ["4(viii)", "4(ix)"],
    ["4(b)", "4(c)"],
    ["Section A", ""],
  ])("after %s suggests %s", (previous, next) => {
    expect(nextQuestionNumber(previous)).toBe(next);
  });
});

describe("percent", () => {
  it("rounds to a whole percent", () => {
    expect(percent(0.625)).toBe("63%");
    expect(percent(0)).toBe("0%");
  });
});

describe("trend", () => {
  it("compares the latest score with the one before", () => {
    expect(trend([])).toBeNull();
    expect(trend([{ score: 30, outOf: 60 }])).toBeNull();
    expect(
      trend([
        { score: 30, outOf: 60 },
        { score: 40, outOf: 60 },
      ]),
    ).toBe("up");
    expect(
      trend([
        { score: 40, outOf: 60 },
        { score: 30, outOf: 60 },
      ]),
    ).toBe("down");
    // Different totals: 50% and 50%.
    expect(
      trend([
        { score: 30, outOf: 60 },
        { score: 40, outOf: 80 },
      ]),
    ).toBe("same");
  });
});

describe("analysePapers", () => {
  const q = (id: string, marks: number, ...topicIds: string[]) => ({ id, marks, topicIds });

  it("spreads each paper's marks over its topics, sharing a question's marks between its topics", () => {
    const analysis = analysePapers([
      { id: "p1", questions: [q("a", 6, "thermo"), q("b", 4, "thermo", "waves")], latestMarks: null },
      { id: "p2", questions: [q("c", 8, "waves"), q("d", 2)], latestMarks: null },
      // Questions not entered yet: left out of the sample.
      { id: "p3", questions: [], latestMarks: null },
    ]);
    expect(analysis.paperCount).toBe(2);
    expect(analysis.totalMarks).toBe(20);
    expect(analysis.untaggedShare).toBeCloseTo(0.1);
    expect(analysis.topics.map((t) => [t.topicId, t.marks, t.share, t.papers, t.score])).toEqual([
      ["waves", 10, 0.5, 2, null],
      ["thermo", 8, 0.4, 1, null],
    ]);
  });

  it("scores each topic from the latest attempt at each paper", () => {
    const analysis = analysePapers([
      {
        id: "p1",
        questions: [q("a", 6, "thermo"), q("b", 4, "thermo", "waves")],
        latestMarks: new Map([
          ["a", 3],
          ["b", 4],
        ]),
      },
      { id: "p2", questions: [q("c", 10, "waves")], latestMarks: null },
    ]);
    const thermo = analysis.topics.find((t) => t.topicId === "thermo")!;
    // 3 of 6, plus half of question b (4 of 4 marks, so 2 of 2).
    expect(thermo.available).toBe(8);
    expect(thermo.gained).toBe(5);
    expect(thermo.score).toBeCloseTo(5 / 8);
    expect(thermo.lost).toBeCloseTo(3 / 20);
    // Waves was only attempted on paper 1, where its half of question b was all right.
    const waves = analysis.topics.find((t) => t.topicId === "waves")!;
    expect(waves.available).toBe(2);
    expect(waves.score).toBe(1);
    expect(waves.lost).toBe(0);
  });

  it("caps a mark at the question's marks if the question was changed after the attempt", () => {
    const analysis = analysePapers([{ id: "p1", questions: [q("a", 4, "thermo")], latestMarks: new Map([["a", 6]]) }]);
    expect(analysis.topics[0].score).toBe(1);
  });

  it("is empty with no questions entered", () => {
    expect(analysePapers([{ id: "p1", questions: [], latestMarks: null }])).toEqual({
      paperCount: 0,
      totalMarks: 0,
      untaggedShare: 0,
      topics: [],
    });
  });
});

describe("focusTopics", () => {
  it("puts the topics where the most marks were lost first, then the untried ones worth the most", () => {
    const analysis = analysePapers([
      {
        id: "p1",
        questions: [q("a", 10, "thermo"), q("b", 10, "waves"), q("c", 10, "optics"), q("d", 20, "circuits")],
        latestMarks: new Map([
          ["a", 2],
          ["b", 9],
          ["c", 10],
        ]),
      },
    ]);
    expect(focusTopics(analysis).map((t) => t.topicId)).toEqual(["thermo", "waves", "circuits"]);
  });

  function q(id: string, marks: number, ...topicIds: string[]) {
    return { id, marks, topicIds };
  }
});
