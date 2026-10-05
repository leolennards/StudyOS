export type TopicGroup = { label: string; topics: { id: string; name: string }[] };

type Section = { label: string; title: string; topics: { id: string; name: string }[]; children: Section[] };

/** A subject's topics grouped under their sections, for the topic pickers on documents and notes. */
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

type SectionNode = { id: string; label: string; title: string; children: SectionNode[] };

/** A subject's sections in order, flattened for a picker, each named "Label: Title". */
export function sectionOptions(sections: SectionNode[], depth = 1): { id: string; name: string; depth: number }[] {
  return sections.flatMap((s) => [
    { id: s.id, name: `${s.label}: ${s.title}`, depth },
    ...sectionOptions(s.children, depth + 1),
  ]);
}
