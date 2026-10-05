"use client";

import { useRouter } from "next/navigation";

const selectClass =
  "flex h-9 w-full min-w-48 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

/** Chooses what to review: every subject, or one of them. */
export function ReviewScopePicker({ value, options }: { value: string; options: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Review cards from"
      className={selectClass}
      value={value}
      onChange={(e) => router.push(e.target.value ? `/review?subject=${e.target.value}` : "/review")}
    >
      <option value="">All subjects</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
