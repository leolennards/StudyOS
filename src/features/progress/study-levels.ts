/** Heatmap shades for a day's study against the goal (0 none … 4 well past it). Static so Tailwind sees them. */
export const LEVEL_CLASSES = ["bg-muted", "bg-primary/25", "bg-primary/50", "bg-primary/80", "bg-primary"] as const;

export const LEVEL_LABELS = ["No study", "Under half the goal", "Over half the goal", "Goal met", "Well past the goal"];
