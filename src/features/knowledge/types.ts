/** Serializable shapes passed from the subject page (server) to its editors (client). */
export type TopicView = { id: string; name: string; description: string | null; sectionId: string | null };
export type SectionView = {
  id: string;
  label: string;
  title: string;
  parentId: string | null;
  children: SectionView[];
  topics: TopicView[];
};
export type SectionOption = { id: string; name: string; depth: number };

export function flattenSections(sections: SectionView[], depth = 1): SectionOption[] {
  return sections.flatMap((s) => [
    { id: s.id, name: `${s.label}: ${s.title}`, depth },
    ...flattenSections(s.children, depth + 1),
  ]);
}
