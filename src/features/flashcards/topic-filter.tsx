"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TopicGroup } from "@/features/knowledge/topic-groups";

const selectClass =
  "flex h-9 w-full max-w-64 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

/** Narrows a subject's cards (and its review) to one topic. */
export function TopicFilter({ groups, value }: { groups: TopicGroup[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const withTopics = groups.filter((g) => g.topics.length > 0);
  if (withTopics.length === 0) return null;

  function choose(topicId: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("card");
    if (topicId) params.set("topic", topicId);
    else params.delete("topic");
    router.push(params.size > 0 ? `${pathname}?${params}` : pathname);
  }

  return (
    <select aria-label="Topic" className={selectClass} value={value ?? ""} onChange={(e) => choose(e.target.value)}>
      <option value="">All topics</option>
      {withTopics.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
