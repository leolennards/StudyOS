import type { TopicGroup } from "./types";

type Section = { label: string; title: string; topics: { id: string; name: string }[]; children: Section[] };

/** A subject's topics grouped under their sections, for the topic picker. */
export function topicGroups(sections: Section[], unsectioned: { id: string; name: string }[]): TopicGroup[] {
  const groups: TopicGroup[] = [];
  const walk = (list: Section[]) => {
    for (const s of list) {
      groups.push({ label: `${s.label}: ${s.title}`, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) });
      walk(s.children);
    }
  };
  walk(sections);
  groups.push({ label: "No section", topics: unsectioned.map((t) => ({ id: t.id, name: t.name })) });
  return groups;
}
