import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Archive, ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { SubjectActions } from "@/features/knowledge/subject-actions";
import { colourClasses } from "@/features/knowledge/subject-colour";
import { SubjectTabs } from "@/features/knowledge/subject-tabs";
import { cn } from "@/lib/utils";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { examsService } from "@/server/modules/exams/service";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { libraryService } from "@/server/modules/library/service";
import { notesService } from "@/server/modules/notes/service";

async function load(subjectId: string) {
  if (!isUuid(subjectId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const tree = await knowledgeService.getSubjectTree(ctx, subjectId);
    const [documentCount, noteCount, cardCount, paperCount] = await Promise.all([
      libraryService.countDocuments(ctx, subjectId),
      notesService.countNotes(ctx, subjectId),
      flashcardsService.countCards(ctx, subjectId),
      examsService.countPapers(ctx, subjectId),
    ]);
    return { ...tree, documentCount, noteCount, cardCount, paperCount };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: LayoutProps<"/subjects/[subjectId]">): Promise<Metadata> {
  const { subjectId } = await params;
  const { subject } = await load(subjectId);
  return { title: subject.name };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The subject's header and tabs, shared by its structure, notes, documents, flashcards and past papers pages. */
export default async function SubjectLayout({ params, children }: LayoutProps<"/subjects/[subjectId]">) {
  const { subjectId } = await params;
  const { subject, sectionCount, topicCount, documentCount, noteCount, cardCount, paperCount } = await load(subjectId);
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
              {plural(sectionCount, "section")}, {plural(topicCount, "topic")}, {plural(noteCount, "note")},{" "}
              {plural(documentCount, "document")}, {plural(cardCount, "flashcard")}
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

      <SubjectTabs
        subjectId={subject.id}
        noteCount={noteCount}
        documentCount={documentCount}
        cardCount={cardCount}
        paperCount={paperCount}
      />

      <div className="mt-6">{children}</div>
    </PageContainer>
  );
}
