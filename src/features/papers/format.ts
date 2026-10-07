import { formatDateKey } from "@/server/modules/progress/domain/calendar";

/** "12 Sept 2026", the day a paper was sat. */
export const formatTakenOn = (takenOn: string) =>
  formatDateKey(takenOn, { day: "numeric", month: "short", year: "numeric" });

/** "2023 · 90 min · 80 marks · 12 questions", leaving out what isn't known. */
export function paperFacts(paper: {
  year: number | null;
  durationMin: number | null;
  total: number | null;
  questionCount: number;
}) {
  return [
    paper.year !== null ? String(paper.year) : null,
    paper.durationMin !== null ? `${paper.durationMin} min` : null,
    paper.total !== null ? `${paper.total} marks` : null,
    paper.questionCount > 0 ? `${paper.questionCount} question${paper.questionCount === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => part !== null);
}
