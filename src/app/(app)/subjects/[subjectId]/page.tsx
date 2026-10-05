import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Archive, ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { StructureEditor } from "@/features/knowledge/structure-editor";
import { SubjectActions } from "@/features/knowledge/subject-actions";
import { colourClasses } from "@/features/knowledge/subject-colour";
import type { SectionView, TopicView } from "@/features/knowledge/types";
import { cn } from "@/lib/utils";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";

async function load(subjectId: string) {
  if (!isUuid(subjectId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    return await knowledgeService.getSubjectTree(ctx, subjectId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<"/subjects/[subjectId]">): Promise<Metadata> {
  const { subjectId } = await params;
  const { subject } = await load(subjectId);
  return { title: subject.name };
}

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

export default async function SubjectPage({ params }: PageProps<"/subjects/[subjectId]">) {
  const { subjectId } = await params;
  const { subject, sections, unsectioned, sectionCount, topicCount } = await load(subjectId);
  const c = colourClasses(subject.colour);
  const archived = subject.archivedAt !== null;

  return (
    <PageContainer>
      <Link
        href={archived ? "/subjects?view=archived" : "/subjects"}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Subjects
      </Link>
      <PageHeader
        leading={
          <span
            aria-hidden
            className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-lg font-semibold", c.soft, c.text)}
          >
            {subject.name.slice(0, 1).toUpperCase()}
          </span>
        }
        title={subject.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {[subject.code, subject.term].filter(Boolean).join(" · ") || null}
            {(subject.code || subject.term) && <span aria-hidden>·</span>}
            <span>
              {sectionCount} section{sectionCount === 1 ? "" : "s"}, {topicCount} topic{topicCount === 1 ? "" : "s"}
            </span>
          </span>
        }
        actions={
          <SubjectActions
            archived={archived}
            subject={{
              id: subject.id,
              name: subject.name,
              code: subject.code,
              term: subject.term,
              description: subject.description,
              colour: subject.colour,
            }}
          />
        }
      />

      {archived && (
        <p
          role="status"
          className="bg-muted/50 text-muted-foreground mt-6 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <Archive className="size-4" aria-hidden />
          This subject is archived. Restore it from the menu to show it in your sidebar again.
        </p>
      )}

      {subject.description && <p className="mt-6 max-w-prose text-sm whitespace-pre-line">{subject.description}</p>}

      <div className="mt-8">
        <StructureEditor
          subjectId={subject.id}
          sections={sections.map(toSection)}
          unsectioned={unsectioned.map(toTopic)}
        />
      </div>
    </PageContainer>
  );
}
