import { cn } from "@/lib/utils";

/** The StudyOS mark: an open book forming an upward arrow (learning that compounds). */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg shadow-xs">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <path d="M4 18V7.5C6.5 6 9.5 6 12 7.5 14.5 6 17.5 6 20 7.5V18c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0Z" />
          <path d="M12 7.5V18" />
        </svg>
      </span>
      {withWordmark && <span className="text-[15px]">StudyOS</span>}
    </span>
  );
}
