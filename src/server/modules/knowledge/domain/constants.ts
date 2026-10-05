/** Subject colours map to theme tokens (`--subject-<name>`), never raw values. */
export const SUBJECT_COLOURS = [
  "indigo",
  "violet",
  "sky",
  "teal",
  "emerald",
  "amber",
  "orange",
  "rose",
  "pink",
  "slate",
] as const;
export type SubjectColour = (typeof SUBJECT_COLOURS)[number];

/** Suggested section labels. Users can type their own (ADR-006). */
export const SECTION_LABEL_SUGGESTIONS = ["Module", "Chapter", "Week", "Unit", "Lecture", "Part"] as const;

/** Sections nest at most two levels: e.g. Module → Chapter. */
export const MAX_SECTION_DEPTH = 2;

export const LIMITS = {
  subjectName: 120,
  subjectCode: 20,
  subjectTerm: 60,
  subjectDescription: 500,
  sectionLabel: 30,
  sectionTitle: 160,
  topicName: 160,
  topicDescription: 1000,
} as const;
