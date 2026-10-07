import { cn } from "@/lib/utils";

/** A row of radio buttons drawn as pills, for picking one of a few short options. */
export function ChoiceGroup({
  legend,
  name,
  value,
  onChange,
  options,
  className,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid grid-cols-3 gap-2", className)}>
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "peer-focus-visible:ring-ring/50 flex h-full min-h-9 items-center justify-center rounded-md border px-2 py-1.5 text-center text-sm font-medium transition-colors peer-focus-visible:ring-[3px]",
                value === o.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
