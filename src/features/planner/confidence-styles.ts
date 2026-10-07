import type { ConfidenceLevel } from "@/server/modules/planner/domain/exams";

/** Colours for each confidence level: red, amber, green. Shared by server and client components. */
export const CONFIDENCE_CLASSES: Record<ConfidenceLevel, { on: string; dot: string }> = {
  1: { on: "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  2: { on: "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  3: { on: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
};
