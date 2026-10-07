/** Colours for a quiz score: green from 80%, amber from 50%, red below. */
export function scoreTone(percent: number | null) {
  if (percent === null) return { text: "text-muted-foreground", bar: "bg-muted-foreground/40", ring: "text-muted" };
  if (percent >= 80)
    return { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", ring: "text-emerald-500" };
  if (percent >= 50) return { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", ring: "text-amber-500" };
  return { text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", ring: "text-rose-500" };
}

/** "3 of 4 right". */
export function rightLine(correct: number, answered: number) {
  return `${correct} of ${answered} right`;
}
