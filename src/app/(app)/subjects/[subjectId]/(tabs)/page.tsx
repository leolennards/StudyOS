import { StructureEditor } from "@/features/knowledge/structure-editor";
import type { SectionView, TopicView } from "@/features/knowledge/types";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";

type TreeSection = Awaited<ReturnType<typeof knowledgeService.getSubjectTree>>["sections"][number];
type TreeTopic = Awaited<ReturnType<typeof knowledgeService.getSubjectTree>>["unsectioned"][number];

const toTopic = (t: TreeTopic): TopicView => ({
  id: t.id,
  name: t.name,
  description: t.description,
  sectionId: t.sectionId,
});
const toSection = (s: TreeSection): SectionView => ({
  id: s.id,
  label: s.label,
  title: s.title,
  parentId: s.parentId,
  children: s.children.map(toSection),
  topics: s.topics.map(toTopic),
});

/** The subject's structure: its sections and topics. The layout has already checked the subject exists. */
export default async function SubjectStructurePage({ params }: PageProps<"/subjects/[subjectId]">) {
  const { subjectId } = await params;
  const { ctx } = await requirePageSession();
  const { subject, sections, unsectioned } = await knowledgeService.getSubjectTree(ctx, subjectId);
  return (
    <StructureEditor subjectId={subject.id} sections={sections.map(toSection)} unsectioned={unsectioned.map(toTopic)} />
  );
}
