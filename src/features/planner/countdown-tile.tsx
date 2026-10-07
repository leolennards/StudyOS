import { cn } from "@/lib/utils";
import { countdownParts } from "./format";

/** Days left, as a large number in a tile. Turns warm in the last week. */
export function CountdownTile({ days, className }: { days: number; className?: string }) {
  const { value, unit } = countdownParts(days);
  const soon = days >= 0 && days <= 7;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-lg px-2 py-2 text-center",
        days < 0
          ? "bg-muted text-muted-foreground"
          : soon
            ? "bg-orange-500/10 text-orange-700 dark:text-orange-300"
            : "bg-primary/10 text-primary",
        className,
      )}
    >
      <span className={cn("leading-none font-semibold tabular-nums", value.length > 3 ? "text-lg" : "text-2xl")}>
        {value}
      </span>
      {unit && <span className="mt-1 text-[11px] leading-tight">{unit}</span>}
    </div>
  );
}
