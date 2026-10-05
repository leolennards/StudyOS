import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { PageContainer } from "@/components/shared/page-header";
import { sectionOptions, topicGroups } from "@/features/knowledge/topic-groups";
import { NoteEditor } from "@/features/notes/note-editor";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { displayTitle } from "@/server/modules/notes/domain/content";
import { notesService } from "@/server/modules/notes/service";

async function load(subjectId: string, noteId: string) {
  if (!isUuid(subjectId) || !isUuid(noteId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const note = await notesService.getNote(ctx, noteId);
    if (note.subjectId !== subjectId) notFound();
    return { ctx, note };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/subjects/[subjectId]/notes/[noteId]">): Promise<Metadata> {
  const { subjectId, noteId } = await params;
  const { note } = await load(subjectId, noteId);
  return { title: displayTitle(note.title) };
}

/** One note in the editor. */
export default async function NotePage({ params }: PageProps<"/subjects/[subjectId]/notes/[noteId]">) {
  const { subjectId, noteId } = await params;
  const { ctx, note } = await load(subjectId, noteId);
  const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
  const back = `/subjects/${subjectId}/notes${note.deletedAt ? "?view=trash" : ""}`;

  return (
    <PageContainer className="max-w-4xl">
      <Link
        href={back}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tree.subject.name}
      </Link>
      <NoteEditor
        // Restoring a note from the trash starts the editor again, now editable.
        key={`${note.id}-${note.deletedAt ? "trash" : "live"}`}
        note={{
          id: note.id,
          subjectId: note.subjectId,
          sectionId: note.sectionId,
          title: note.title,
          content: note.content,
          revision: note.revision,
          wordCount: note.wordCount,
          updatedAt: note.updatedAt.toISOString(),
          topicIds: note.topicIds,
          trashed: note.deletedAt !== null,
          purgeAt: note.purgeAt?.toISOString() ?? null,
        }}
        sections={sectionOptions(tree.sections)}
        topicGroups={topicGroups(tree.sections, tree.unsectioned)}
      />
    </PageContainer>
  );
}
