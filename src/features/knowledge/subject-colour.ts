import type { SubjectColour } from "@/server/modules/knowledge/domain/constants";

/** Static class names so Tailwind can see them; values come from theme tokens. */
export const subjectColourClasses: Record<SubjectColour, { dot: string; soft: string; text: string; ring: string }> = {
  indigo: {
    dot: "bg-subject-indigo",
    soft: "bg-subject-indigo/12",
    text: "text-subject-indigo",
    ring: "ring-subject-indigo",
  },
  violet: {
    dot: "bg-subject-violet",
    soft: "bg-subject-violet/12",
    text: "text-subject-violet",
    ring: "ring-subject-violet",
  },
  sky: { dot: "bg-subject-sky", soft: "bg-subject-sky/12", text: "text-subject-sky", ring: "ring-subject-sky" },
  teal: { dot: "bg-subject-teal", soft: "bg-subject-teal/12", text: "text-subject-teal", ring: "ring-subject-teal" },
  emerald: {
    dot: "bg-subject-emerald",
    soft: "bg-subject-emerald/12",
    text: "text-subject-emerald",
    ring: "ring-subject-emerald",
  },
  amber: {
    dot: "bg-subject-amber",
    soft: "bg-subject-amber/12",
    text: "text-subject-amber",
    ring: "ring-subject-amber",
  },
  orange: {
    dot: "bg-subject-orange",
    soft: "bg-subject-orange/12",
    text: "text-subject-orange",
    ring: "ring-subject-orange",
  },
  rose: { dot: "bg-subject-rose", soft: "bg-subject-rose/12", text: "text-subject-rose", ring: "ring-subject-rose" },
  pink: { dot: "bg-subject-pink", soft: "bg-subject-pink/12", text: "text-subject-pink", ring: "ring-subject-pink" },
  slate: {
    dot: "bg-subject-slate",
    soft: "bg-subject-slate/12",
    text: "text-subject-slate",
    ring: "ring-subject-slate",
  },
};

export function colourClasses(colour: string) {
  return subjectColourClasses[colour as SubjectColour] ?? subjectColourClasses.slate;
}
