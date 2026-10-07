import { cn } from "@/lib/utils";

/** One headline figure with its label and a line of context. */
export function StatTile({
  icon,
  label,
  value,
  detail,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4 shadow-xs", className)}>
      <p className="text-muted-foreground flex items-center gap-2 text-sm [&_svg]:size-4">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
    </div>
  );
}
