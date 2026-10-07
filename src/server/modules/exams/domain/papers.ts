/**
 * Past-paper rules (Architecture §22). Pure: no database, no clock.
 *
 * The analysis is plain arithmetic the student can check: how much of each
 * paper's marks a topic is worth, and how many of those marks the student
 * got on their latest go at each paper.
 */

export const PAPER_LIMITS = {
  title: 120,
  /** Questions on one paper. */
  questions: 150,
  questionNumber: 20,
  /** Marks for one question, and for a whole paper. */
  questionMarks: 500,
  totalMarks: 2000,
  /** Minutes allowed or taken. */
  minutes: 600,
  /** Topics one question can test. */
  topicsPerQuestion: 10,
  yearFrom: 1950,
  yearTo: 2100,
  /** How far back an attempt's date may be, in days. */
  attemptDaysBack: 5 * 366,
} as const;

export type PaperQuestion = { id: string; marks: number; topicIds: string[] };

/** The paper's total: its questions' marks once entered, otherwise the total given for it. */
export function paperTotal(questions: { marks: number }[], totalMarks: number | null): number | null {
  if (questions.length > 0) return questions.reduce((sum, q) => sum + q.marks, 0);
  return totalMarks;
}

/** A score as a share of what it was out of, from 0 to 1. */
export const scoreShare = (score: number, outOf: number) => (outOf > 0 ? score / outOf : 0);

/** "62%", rounded to a whole percent. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * The number to suggest for the next question: "3" → "4", "2b" → "2c",
 * "Q7" → "Q8", "1a(ii)" → "1a(iii)", "4(b)" → "4(c)". "1" when there is
 * no question before it; empty when the pattern isn't one of those.
 */
export function nextQuestionNumber(previous: string | undefined): string {
  if (previous === undefined) return "1";
  const p = previous.trim();
  const numeral = p.match(/^(.*\()([ivx]+)\)$/);
  if (numeral) {
    const value = fromRoman(numeral[2]);
    return value ? `${numeral[1]}${toRoman(value + 1)})` : "";
  }
  const bracketed = p.match(/^(.*\()([a-y])\)$/);
  if (bracketed) return `${bracketed[1]}${String.fromCharCode(bracketed[2].charCodeAt(0) + 1)})`;
  const letter = p.match(/^(.*\d)([a-y])$/);
  if (letter) return `${letter[1]}${String.fromCharCode(letter[2].charCodeAt(0) + 1)}`;
  const digits = p.match(/^(\D*)(\d+)$/);
  if (digits) return `${digits[1]}${Number(digits[2]) + 1}`;
  return "";
}

const ROMAN: [number, string][] = [
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function toRoman(n: number): string {
  let out = "";
  for (const [value, symbol] of ROMAN) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

function fromRoman(s: string): number | null {
  for (let n = 1; n <= 39; n++) if (toRoman(n) === s) return n;
  return null;
}

export type AnalysedPaper = {
  id: string;
  questions: PaperQuestion[];
  /** The latest attempt's marks per question, when the paper has been sat with its questions entered. */
  latestMarks: Map<string, number> | null;
};

export type TopicAnalysis = {
  topicId: string;
  /** Marks this topic was worth across the analysed papers. */
  marks: number;
  /** Those marks as a share of every mark on the analysed papers, 0 to 1. */
  share: number;
  /** Papers with at least one question on the topic. */
  papers: number;
  /** Marks available, and gained, on the topic in the latest attempt at each paper. */
  available: number;
  gained: number;
  /** Gained over available, or null if no attempt with marks per question covers it yet. */
  score: number | null;
  /** Share of all marks lost on this topic in those attempts: what working on it is worth. */
  lost: number;
};

export type PaperAnalysis = {
  /** Papers whose questions have been entered: the sample the shares come from. */
  paperCount: number;
  totalMarks: number;
  /** Marks on questions with no topic, as a share of all marks. */
  untaggedShare: number;
  /** Highest share first. */
  topics: TopicAnalysis[];
};

/**
 * How the marks on a subject's papers are spread over its topics, and how
 * the student did on each in their latest attempt at each paper. A question
 * on several topics shares its marks between them equally, so the topic
 * shares and the untagged share add up to the whole.
 */
export function analysePapers(papers: AnalysedPaper[]): PaperAnalysis {
  const sample = papers.filter((p) => p.questions.length > 0);
  const totalMarks = sample.reduce((sum, p) => sum + p.questions.reduce((s, q) => s + q.marks, 0), 0);
  const byTopic = new Map<
    string,
    { marks: number; papers: Set<string>; available: number; gained: number; attempted: boolean }
  >();
  let untagged = 0;

  for (const paper of sample) {
    for (const q of paper.questions) {
      const topicIds = [...new Set(q.topicIds)];
      if (topicIds.length === 0) {
        untagged += q.marks;
        continue;
      }
      const part = q.marks / topicIds.length;
      const awarded = paper.latestMarks?.get(q.id);
      for (const topicId of topicIds) {
        const t = byTopic.get(topicId) ?? { marks: 0, papers: new Set(), available: 0, gained: 0, attempted: false };
        t.marks += part;
        t.papers.add(paper.id);
        if (awarded !== undefined) {
          t.available += part;
          // A mark can be above the question's marks if the question was edited after the attempt.
          t.gained += (Math.min(awarded, q.marks) / q.marks) * part;
          t.attempted = true;
        }
        byTopic.set(topicId, t);
      }
    }
  }

  const topics = [...byTopic.entries()]
    .map(([topicId, t]) => ({
      topicId,
      marks: t.marks,
      share: totalMarks > 0 ? t.marks / totalMarks : 0,
      papers: t.papers.size,
      available: t.available,
      gained: t.gained,
      score: t.attempted && t.available > 0 ? t.gained / t.available : null,
      lost: totalMarks > 0 ? (t.available - t.gained) / totalMarks : 0,
    }))
    .sort((a, b) => b.share - a.share || b.papers - a.papers);

  return {
    paperCount: sample.length,
    totalMarks,
    untaggedShare: totalMarks > 0 ? untagged / totalMarks : 0,
    topics,
  };
}

/**
 * The topics to work on first: the ones where the most marks were lost,
 * then, among topics not yet attempted, the ones worth the most.
 */
export function focusTopics<T extends TopicAnalysis>(analysis: { topics: T[] }, limit = 3): T[] {
  const lost = analysis.topics.filter((t) => t.score !== null && t.lost > 0).sort((a, b) => b.lost - a.lost);
  const unseen = analysis.topics.filter((t) => t.score === null);
  return [...lost, ...unseen].slice(0, limit);
}

/** Which way the scores are going: the latest attempt against the one before it. */
export function trend(attempts: { score: number; outOf: number }[]): "up" | "down" | "same" | null {
  if (attempts.length < 2) return null;
  const [previous, latest] = attempts.slice(-2).map((a) => scoreShare(a.score, a.outOf));
  const diff = latest - previous;
  if (Math.abs(diff) < 0.005) return "same";
  return diff > 0 ? "up" : "down";
}
