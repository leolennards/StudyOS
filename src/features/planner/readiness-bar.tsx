import { cn } from "@/lib/utils";
import type { Readiness } from "@/server/modules/planner/domain/exams";

/**
 * Topics by how confident the student feels: confident, getting there,
 * not yet and not rated, as one stacked bar.
 */
export function ReadinessBar({ readiness, className }: { readiness: Readiness; className?: string }) {
  const { total } = readiness;
  const parts = [
    { count: readiness.confident, className: "bg-emerald-500" },
    { count: readiness.gettingThere, className: "bg-amber-500" },
    { count: readiness.notYet, className: "bg-rose-500" },
  ];
  return (
    <div
      className={cn("bg-muted flex h-2 w-full overflow-hidden rounded-full", className)}
      role="img"
      aria-label={readinessLine(readiness)}
    >
      {total > 0 &&
        parts.map(
          (p, i) =>
            p.count > 0 && <div key={i} className={p.className} style={{ width: `${(p.count / total) * 100}%` }} />,
        )}
    </div>
  );
}

/** "3 of 8 topics confident", or why there's nothing to show. */
export function readinessLine(r: Readiness) {
  if (r.total === 0) return "No topics to rate yet";
  if (r.unrated === r.total) return `${r.total} topic${r.total === 1 ? "" : "s"} to rate`;
  return `${r.confident} of ${r.total} topic${r.total === 1 ? "" : "s"} confident`;
}
