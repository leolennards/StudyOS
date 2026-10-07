import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardImporter } from "@/features/flashcards/import/card-importer";
import { ImportHistory } from "@/features/flashcards/import/import-history";
import { topicGroups } from "@/features/knowledge/topic-groups";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { knowledgeService } from "@/server/modules/knowledge/service";

export const metadata: Metadata = { title: "Import flashcards" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function load(subjectId: string) {
  if (!isUuid(subjectId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const [tree, imports] = await Promise.all([
      knowledgeService.getSubjectTree(ctx, subjectId),
      flashcardsService.listImports(ctx, subjectId),
    ]);
    return { tree, imports };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

/** Imports flashcards into a subject from Anki, Quizlet or a spreadsheet (ADR-018). */
export default async function ImportFlashcardsPage({ params }: PageProps<"/subjects/[subjectId]/flashcards/import">) {
  const { subjectId } = await params;
  const { tree, imports } = await load(subjectId);

  return (
    <PageContainer className="max-w-4xl">
      <Link
        href={`/subjects/${subjectId}/flashcards`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tree.subject.name}
      </Link>
      <PageHeader
        title="Import flashcards"
        description="Bring in the cards you already have from Anki, Quizlet or a spreadsheet."
      />
      <div className="mt-8 grid gap-6">
        <CardImporter
          subjectId={subjectId}
          subjectName={tree.subject.name}
          groups={topicGroups(tree.sections, tree.unsectioned)}
        />
        {imports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Earlier imports</h2>
              </CardTitle>
              <CardDescription>Imported into the wrong subject? Delete an import to remove its cards.</CardDescription>
            </CardHeader>
            <CardContent>
              <ImportHistory
                imports={imports.map((i) => ({
                  id: i.id,
                  source: i.source,
                  name: i.name,
                  date: dateFormat.format(i.createdAt),
                  cards: i.cards,
                  reviewed: i.reviewed,
                }))}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
