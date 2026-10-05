import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { DocumentActions } from "@/features/library/document-actions";
import { DocumentStatusLine } from "@/features/library/document-status";
import { DocumentViewer } from "@/features/library/document-viewer";
import { FormatIcon } from "@/features/library/format-icon";
import { topicGroups } from "@/features/library/topic-groups";
import { formatBytes } from "@/features/library/types";
import { isAppError } from "@/server/lib/errors";
import { isUuid } from "@/server/lib/ids";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { FORMAT_LABELS } from "@/server/modules/library/domain/formats";
import { KIND_LABELS } from "@/server/modules/library/domain/kind";
import { libraryService } from "@/server/modules/library/service";

async function load(subjectId: string, documentId: string) {
  if (!isUuid(subjectId) || !isUuid(documentId)) notFound();
  const { ctx } = await requirePageSession();
  try {
    const doc = await libraryService.getDocument(ctx, documentId);
    if (doc.subjectId !== subjectId) notFound();
    return { ctx, doc };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/subjects/[subjectId]/documents/[documentId]">): Promise<Metadata> {
  const { subjectId, documentId } = await params;
  const { doc } = await load(subjectId, documentId);
  return { title: doc.title };
}

/** One document: the original in the viewer and the text read from it. */
export default async function DocumentPage({
  params,
  searchParams,
}: PageProps<"/subjects/[subjectId]/documents/[documentId]">) {
  const { subjectId, documentId } = await params;
  const { page } = await searchParams;
  const { ctx, doc } = await load(subjectId, documentId);
  const [tree, pages, viewUrl] = await Promise.all([
    knowledgeService.getSubjectTree(ctx, subjectId),
    libraryService.getPages(ctx, doc.id),
    libraryService.getViewUrl(ctx, doc.id),
  ]);
  const topicName = new Map([...tree.unsectioned, ...flatten(tree.sections)].map((t) => [t.id, t.name] as const));
  const initialPage = Number(typeof page === "string" ? page : 1) || 1;
  const pageLabel = doc.format === "pptx" ? "Slide" : "Page";

  return (
    <PageContainer className="max-w-6xl">
      <Link
        href={`/subjects/${subjectId}/documents`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mb-4 inline-flex items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tree.subject.name}
      </Link>
      <PageHeader
        leading={<FormatIcon format={doc.format} className="size-11 rounded-xl" />}
        title={doc.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="secondary">{KIND_LABELS[doc.kind]}</Badge>
            <span>{FORMAT_LABELS[doc.format]}</span>
            <span aria-hidden>·</span>
            <span>{formatBytes(doc.sizeBytes)}</span>
            <span aria-hidden>·</span>
            <DocumentStatusLine {...doc} />
          </span>
        }
        actions={
          <DocumentActions
            showEdit
            doc={doc}
            topicGroups={topicGroups(tree.sections, tree.unsectioned)}
            afterDelete={`/subjects/${subjectId}/documents`}
          />
        }
      />

      {doc.topicIds.length > 0 && (
        <ul aria-label="Topics" className="mt-4 flex flex-wrap gap-1">
          {doc.topicIds.map((id) => (
            <li key={id}>
              <Badge variant="outline">{topicName.get(id)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        {doc.status === "ready" ? (
          <DocumentViewer
            title={doc.title}
            preview={doc.preview ?? "text"}
            viewUrl={viewUrl}
            pages={pages}
            pageLabel={pageLabel}
            initialPage={initialPage}
          />
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
            {doc.status === "failed"
              ? "This document couldn't be processed, so there is nothing to show. Try again from the menu, or delete it and upload a different copy."
              : "This document is still being processed. Go back to the documents list to follow its progress."}
          </p>
        )}
      </div>
    </PageContainer>
  );
}

type Section = { topics: { id: string; name: string }[]; children: Section[] };
const flatten = (sections: Section[]): { id: string; name: string }[] =>
  sections.flatMap((s) => [...s.topics, ...flatten(s.children)]);
