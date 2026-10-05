import Link from "next/link";
import { NotebookPen, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { sectionOptions } from "@/features/knowledge/topic-groups";
import { NewNoteButton } from "@/features/notes/new-note-button";
import { NoteList } from "@/features/notes/note-list";
import { TrashList } from "@/features/notes/trash-list";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { notesService } from "@/server/modules/notes/service";

/** A subject's notes, or its trash with `?view=trash`. The layout has already checked the subject exists. */
export default async function SubjectNotesPage({ params, searchParams }: PageProps<"/subjects/[subjectId]/notes">) {
  const { subjectId } = await params;
  const { view } = await searchParams;
  const { ctx } = await requirePageSession();
  const showTrash = view === "trash";
  const [notes, trash, tree] = await Promise.all([
    showTrash ? Promise.resolve([]) : notesService.listNotes(ctx, subjectId),
    notesService.listTrash(ctx, subjectId),
    knowledgeService.getSubjectTree(ctx, subjectId),
  ]);
  const sectionName = new Map(sectionOptions(tree.sections).map((s) => [s.id, s.name] as const));
  const base = `/subjects/${subjectId}/notes`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showTrash ? (
          <h2 className="font-semibold">Trash</h2>
        ) : (
          <NewNoteButton subjectId={subjectId} variant={notes.length === 0 ? "outline" : "default"} />
        )}
        <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
          {showTrash ? (
            <Link href={base}>Back to notes</Link>
          ) : (
            <Link href={`${base}?view=trash`}>
              <Trash2 aria-hidden />
              Trash{trash.length > 0 ? ` (${trash.length})` : ""}
            </Link>
          )}
        </Button>
      </div>

      {showTrash ? (
        trash.length === 0 ? (
          <EmptyState
            icon={<Trash2 />}
            title="The trash is empty"
            description="Notes you delete stay here for 30 days, so you can restore them."
          />
        ) : (
          <TrashList
            subjectId={subjectId}
            notes={trash.map((n) => ({
              id: n.id,
              subjectId,
              title: n.title,
              excerpt: n.excerpt,
              purgeAt: n.purgeAt.toISOString(),
            }))}
          />
        )
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="No notes yet"
          description="Write up lectures, summarise readings and work through problems. Notes support headings, lists, tables, code and LaTeX maths."
          action={<NewNoteButton subjectId={subjectId} />}
        />
      ) : (
        <NoteList
          notes={notes.map((n) => ({
            id: n.id,
            subjectId: n.subjectId,
            title: n.title,
            excerpt: n.excerpt,
            wordCount: n.wordCount,
            updatedAt: n.updatedAt.toISOString(),
            section: n.sectionId ? (sectionName.get(n.sectionId) ?? null) : null,
            topics: n.topics,
          }))}
        />
      )}
    </div>
  );
}
