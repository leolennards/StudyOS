import { daysUntil } from "@/server/modules/planner/domain/exams";
import type { PlanItem } from "@/server/modules/planner/plan-service";
import { formatDateKey } from "@/server/modules/progress/domain/calendar";

/** "Today", "Tomorrow", or "Wednesday 15 Oct". */
export function dayLabel(day: string, today: string) {
  const days = daysUntil(today, day);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return formatDateKey(day, { weekday: "long", day: "numeric", month: "short" });
}

/** What the item asks the student to do. */
export function itemTitle(item: PlanItem) {
  switch (item.kind) {
    case "review":
      return "Review flashcards";
    case "topic":
      return item.topic ? item.topic.name : `Revise for ${item.deadline?.title ?? "your exam"}`;
    case "paper":
      return `Sit ${item.paper?.title ?? "a past paper"}`;
    case "assignment":
      return `Work on ${item.deadline?.title ?? "your assignment"}`;
  }
}

/** Why it is in the plan: the cards, or the exam or deadline it is for and when that is. */
export function itemDetail(item: PlanItem) {
  if (item.kind === "review") {
    const cards = item.cards ?? 0;
    return `About ${cards} card${cards === 1 ? "" : "s"}`;
  }
  if (!item.deadline) return item.subject?.name ?? "";
  const on = formatDateKey(item.deadline.dueOn, { weekday: "short", day: "numeric", month: "short" });
  const what = item.kind === "assignment" ? `due ${on}` : `for ${item.deadline.title} on ${on}`;
  return [item.subject?.name, what].filter(Boolean).join(" · ");
}

/** Where to go to do it. */
export function itemHref(item: PlanItem) {
  switch (item.kind) {
    case "review":
      return "/review";
    case "topic":
      if (item.topic && item.topic.cards > 0 && item.subject)
        return `/review?subject=${item.subject.id}&topic=${item.topic.id}`;
      return item.subject ? `/focus?subject=${item.subject.id}` : "/focus";
    case "paper":
      return item.paper && item.subject ? `/subjects/${item.subject.id}/papers/${item.paper.id}` : "/exams";
    case "assignment":
      return item.deadline ? `/exams/${item.deadline.id}` : "/exams";
  }
}
